/** Статусы канбана и legacy-значения из ENUM task_status */
export function statusImpliesCompleted(status) {
  return status === "done" || status === "release_ready";
}
