import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/http.js';
import * as c from './attendance.controller.js';
import { editAttendanceBody, exportAttendanceQuery, listAttendanceQuery } from './attendance.schema.js';

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
