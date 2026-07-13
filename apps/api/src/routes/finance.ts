import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";

const transactionInput = z.object({
  patientId: z.uuid().optional(), appointmentId: z.uuid().optional(), professionalUserId: z.uuid().optional(),
  kind: z.enum(["income", "expense"]), description: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(100), accountName: z.string().trim().min(2).max(100).default("Caixa principal"),
  paymentMethod: z.enum(["cash", "pix", "card", "transfer", "bank_slip", "other"]).optional(),
  amount: z.number().positive().max(99_999_999_999.99), dueDate: z.iso.date(), notes: z.string().trim().max(1000).optional(),
});
const listQuery = z.object({ from: z.iso.date(), to: z.iso.date(), kind: z.enum(["income", "expense"]).optional(), status: z.enum(["pending", "paid", "cancelled"]).optional() });
const statusInput = z.object({ status: z.enum(["pending", "paid", "cancelled"]), paymentMethod: z.enum(["cash", "pix", "card", "transfer", "bank_slip", "other"]).optional() });
const reportQuery=z.object({from:z.iso.date(),to:z.iso.date(),professionalUserId:z.uuid().optional()});

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.get("/", { preHandler: [requirePermission("finance.read")] }, async (request) => {
    const query = listQuery.parse(request.query);
    return withTenant(request.auth, async (client) => {
      const professionalScope=request.auth.role==='clinician'?request.auth.userId:null;
      const [items, summary] = await Promise.all([
        client.query(`SELECT f.id, f.patient_id, p.full_name AS patient_name, f.kind, f.description, f.category,
          f.account_name, f.payment_method, f.amount, f.due_date, f.status, f.paid_at, f.notes, f.created_at
          FROM financial_transactions f LEFT JOIN patients p ON p.tenant_id=f.tenant_id AND p.id=f.patient_id
          WHERE f.tenant_id=$1 AND f.due_date BETWEEN $2 AND $3
            AND ($4::text IS NULL OR f.kind=$4) AND ($5::text IS NULL OR f.status=$5)
            AND ($6::uuid IS NULL OR f.professional_user_id=$6)
          ORDER BY f.due_date DESC, f.created_at DESC`, [request.auth.tenantId, query.from, query.to, query.kind ?? null, query.status ?? null,professionalScope]),
        client.query(`SELECT
          coalesce(sum(amount) FILTER (WHERE kind='income' AND status='paid'),0) AS paid_income,
          coalesce(sum(amount) FILTER (WHERE kind='expense' AND status='paid'),0) AS paid_expense,
          coalesce(sum(amount) FILTER (WHERE kind='income' AND status='pending'),0) AS pending_income,
          coalesce(sum(amount) FILTER (WHERE kind='expense' AND status='pending'),0) AS pending_expense
          FROM financial_transactions WHERE tenant_id=$1 AND due_date BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR professional_user_id=$4)`, [request.auth.tenantId, query.from, query.to,professionalScope]),
      ]);
      return { items: items.rows, summary: summary.rows[0] };
    });
  });
  app.post("/", { preHandler: [requirePermission("finance.write")] }, async (request, reply) => {
    const input = transactionInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const commissionRate=0;let commissionAmount=0;
      if(input.kind==='income'&&input.professionalUserId){const membership=await client.query("SELECT 1 FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND role IN ('owner','admin','clinician') AND status='active'",[request.auth.tenantId,input.professionalUserId]);if(!membership.rows[0])return reply.code(400).send({error:"financial_professional_invalid"});}
      if(input.kind==='income'&&input.appointmentId){const appointment=await client.query<{professional_amount_snapshot:string;professional_user_id:string}>("SELECT professional_amount_snapshot,professional_user_id FROM appointments WHERE tenant_id=$1 AND id=$2",[request.auth.tenantId,input.appointmentId]);if(!appointment.rows[0])return reply.code(400).send({error:"appointment_not_found"});if(input.professionalUserId&&input.professionalUserId!==appointment.rows[0].professional_user_id)return reply.code(400).send({error:"financial_professional_invalid"});commissionAmount=Number(appointment.rows[0].professional_amount_snapshot);}
      const result = await client.query<{ id: string }>(`INSERT INTO financial_transactions
        (tenant_id,patient_id,appointment_id,professional_user_id,kind,description,category,account_name,payment_method,amount,due_date,notes,commission_rate_snapshot,commission_amount,created_by,updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id`,
        [request.auth.tenantId,input.patientId ?? null,input.appointmentId ?? null,input.professionalUserId??null,input.kind,input.description,input.category,input.accountName,input.paymentMethod ?? null,input.amount,input.dueDate,input.notes ?? null,commissionRate,commissionAmount,request.auth.userId]);
      const id=result.rows[0]!.id;
      await writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"finance.transaction_create",resourceType:"financial_transaction",resourceId:id,requestId:request.id,ip:request.ip,after:{kind:input.kind,amount:input.amount,dueDate:input.dueDate}});
      return reply.code(201).send({id});
    });
  });
  app.patch("/:id/status", { preHandler: [requirePermission("finance.write")] }, async (request, reply) => {
    const {id}=z.object({id:z.uuid()}).parse(request.params); const input=statusInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const result=await client.query<{status:string}>(`UPDATE financial_transactions SET status=$1,
        paid_at=CASE WHEN $1='paid' THEN now() ELSE NULL END,
        commission_status=CASE WHEN $1='paid' AND commission_amount>0 THEN 'pending' WHEN $1='cancelled' THEN 'waived' ELSE commission_status END,
        payment_method=CASE WHEN $1='paid' THEN coalesce($2,payment_method,'other') ELSE payment_method END, updated_by=$3
        WHERE tenant_id=$4 AND id=$5 AND status<>'cancelled' RETURNING status`,[input.status,input.paymentMethod ?? null,request.auth.userId,request.auth.tenantId,id]);
      if(!result.rows[0]) return reply.code(404).send({error:"financial_transaction_not_found"});
      await writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"finance.transaction_status",resourceType:"financial_transaction",resourceId:id,requestId:request.id,ip:request.ip,after:{status:input.status}});
      return {id,status:result.rows[0].status};
    });
  });
  app.post("/:id/commission-paid",{preHandler:[requirePermission("finance.close")]},async(request,reply)=>{const{id}=z.object({id:z.uuid()}).parse(request.params);return withTenant(request.auth,async client=>{const result=await client.query("UPDATE financial_transactions SET commission_status='paid',commission_paid_at=now(),updated_by=$1 WHERE tenant_id=$2 AND id=$3 AND status='paid' AND commission_status='pending' RETURNING id",[request.auth.userId,request.auth.tenantId,id]);if(!result.rows[0])return reply.code(409).send({error:"commission_not_payable"});await writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"finance.commission_paid",resourceType:"financial_transaction",resourceId:id,requestId:request.id,ip:request.ip,after:{commissionStatus:"paid"}});return{id};});});
  app.get("/report",{preHandler:[requirePermission("finance.read")]},async request=>{const query=reportQuery.parse(request.query);return withTenant(request.auth,async client=>{const scope=request.auth.role==='clinician'?request.auth.userId:query.professionalUserId??null;const[summary,professionals,entries]=await Promise.all([
    client.query(`SELECT coalesce(sum(amount) FILTER(WHERE kind='income' AND status='paid'),0) AS total_received,coalesce(sum(amount) FILTER(WHERE kind='income' AND status<>'cancelled'),0) AS total_billed,coalesce(sum(amount) FILTER(WHERE kind='expense' AND status='paid'),0) AS expenses_paid,coalesce(sum(amount) FILTER(WHERE kind='expense' AND status='pending'),0) AS expenses_pending,coalesce(sum(commission_amount) FILTER(WHERE kind='income' AND status='paid'),0) AS total_commissions,coalesce(sum(commission_amount) FILTER(WHERE commission_status='pending'),0) AS commissions_due,coalesce(sum(commission_amount) FILTER(WHERE commission_status='paid'),0) AS commissions_paid FROM financial_transactions WHERE tenant_id=$1 AND due_date BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR (kind='income' AND professional_user_id=$4))`,[request.auth.tenantId,query.from,query.to,scope]),
    client.query(`SELECT f.professional_user_id,u.name AS professional_name,'procedure' AS payout_model,coalesce(sum(f.amount) FILTER(WHERE f.status='paid'),0) AS received,coalesce(sum(f.amount) FILTER(WHERE f.status='pending'),0) AS pending,coalesce(sum(f.commission_amount) FILTER(WHERE f.commission_status='pending'),0) AS commission_due,coalesce(sum(f.commission_amount) FILTER(WHERE f.commission_status='paid'),0) AS commission_paid FROM financial_transactions f JOIN users u ON u.id=f.professional_user_id WHERE f.tenant_id=$1 AND f.kind='income' AND f.due_date BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR f.professional_user_id=$4) GROUP BY f.professional_user_id,u.name ORDER BY u.name`,[request.auth.tenantId,query.from,query.to,scope]),
    client.query(`SELECT f.id,f.kind,f.due_date,f.paid_at,f.description,f.payment_method,f.amount,f.status,f.commission_amount,f.commission_status,f.commission_paid_at,u.name AS professional_name FROM financial_transactions f LEFT JOIN users u ON u.id=f.professional_user_id WHERE f.tenant_id=$1 AND f.due_date BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR (f.kind='income' AND f.professional_user_id=$4)) ORDER BY coalesce(f.paid_at,f.due_date::timestamptz) DESC`,[request.auth.tenantId,query.from,query.to,scope])]);const row=summary.rows[0] as Record<string,string>;const netAfterCommissions=Number(row.total_received)-Number(row.total_commissions);return{scope:request.auth.role==='clinician'?"professional":"clinic",summary:{...row,net_after_commissions:netAfterCommissions,operating_result:netAfterCommissions-Number(row.expenses_paid)},professionals:professionals.rows,entries:entries.rows};});});
}
