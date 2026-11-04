import { Router } from 'express';
import * as c from '../controllers/attendance.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { editAttendanceBody, exportAttendanceQuery, listAttendanceQuery } from '../validators/attendance.validator.js';

export function attendanceRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('attendance.read'), validate({ query: listAttendanceQuery }), c.list);
  r.get('/today', authorize('attendance.check'), c.today);
  r.get('/export', authorize('attendance.read'), validate({ query: exportAttendanceQuery }), c.exportCsv);
  r.post('/check-in', authorize('attendance.check'), c.checkIn);
  r.post('/check-out', authorize('attendance.check'), c.checkOut);
  r.put('/:id', authorize('attendance.manage'), validate({ params: idParams, body: editAttendanceBody }), c.edit);
  return r;
}

export const attendanceDocs: Op[] = [
  { method: 'get', path: '/api/attendance', tag: 'Attendance', summary: 'Attendance records in scope', permission: 'attendance.read', query: listAttendanceQuery },
  { method: 'get', path: '/api/attendance/today', tag: 'Attendance', summary: "Caller's record for today", permission: 'attendance.check' },
  { method: 'get', path: '/api/attendance/export', tag: 'Attendance', summary: 'CSV export (UTF-8 with BOM)', permission: 'attendance.read', query: exportAttendanceQuery },
  { method: 'post', path: '/api/attendance/check-in', tag: 'Attendance', summary: 'Check in now (server time)', permission: 'attendance.check', status: 201 },
  { method: 'post', path: '/api/attendance/check-out', tag: 'Attendance', summary: 'Check out now (server time)', permission: 'attendance.check' },
  { method: 'put', path: '/api/attendance/:id', tag: 'Attendance', summary: 'Correct a record (note required)', permission: 'attendance.manage', body: editAttendanceBody },
];
