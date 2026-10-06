import { expect, it } from "vitest";
import { alarmTime, alarmSenders, dueAlarms, type PendingAlarm } from "./model";
it("interprets date and time in Jakarta regardless of machine timezone", () => {
  expect(new Date(alarmTime("2026-10-07", "08:30")).toISOString()).toBe("2026-10-07T01:30:00.000Z");
  expect(alarmTime("2026-02-31", "08:00")).toBeNaN();
  expect(alarmTime("2026-10-07", "99:00")).toBeNaN();
});
it("only dispatches waiting alarms that are due, including after waking", () => {
  const rows = ["waiting", "sending", "sent", "failed"].map((status) => ({ id: status, status, dueAt: 100 })) as PendingAlarm[];
  expect(dueAlarms(rows, 99)).toHaveLength(0);
  expect(dueAlarms(rows, 110)).toEqual([rows[0]]);
});
it("fails closed on malformed permissions", () => {
  expect(alarmSenders({ admin: true })).toEqual([]);
  expect(alarmSenders(["bad-id"])).toEqual([]);
});
