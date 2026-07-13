import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppointmentDetailsModal } from "./AppointmentDetailsModal";

function elements(node: ReactNode): ReactElement[] {
  if (!isValidElement(node)) return [];
  const current = node as ReactElement<{ children?: ReactNode }>;
  return [current, ...Children.toArray(current.props.children).flatMap(elements)];
}

describe("AppointmentDetailsModal", () => {
  it("calls the start handler when the consultation button is clicked", () => {
    const onStart = vi.fn();
    const tree = AppointmentDetailsModal({
      appointment: {
        patient_name: "Paciente de Teste",
        starts_at: "2026-07-11T11:00:00.000Z",
        ends_at: "2026-07-11T11:30:00.000Z",
        status: "in_progress",
        type: "Consulta",
        professional_name: "Administrador Local",
        notes: null,
      },
      patient: { birth_date: "1990-03-26", phone: "62999990000" },
      onStatus: vi.fn(),
      onStart,
      onEdit: vi.fn(),
      close: vi.fn(),
    });
    const button = elements(tree).find((element) => {
      const props = element.props as { children?: ReactNode };
      return element.type === "button" && String(props.children).includes("Continuar atendimento");
    }) as ReactElement<{ onClick: () => void }> | undefined;
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(onStart).toHaveBeenCalledOnce();
  });
});
