import { toAttendanceRow, type AttendanceWithEmployee } from '../models/attendance.model.js';

export const attendanceListView = ({ employee, ...a }: AttendanceWithEmployee) => {
  const { department, ...emp } = employee;
  return { ...toAttendanceRow(a), employee: emp, department };
};
