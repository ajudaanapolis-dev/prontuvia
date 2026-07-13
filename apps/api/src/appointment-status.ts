export const appointmentStatuses = [
  "scheduled",
  "confirmed",
  "waiting",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];

const allowedTransitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["confirmed", "waiting", "cancelled", "no_show"],
  confirmed: ["waiting", "cancelled", "no_show"],
  waiting: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return allowedTransitions[from].includes(to);
}
