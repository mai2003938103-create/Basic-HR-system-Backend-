import { Router } from 'express';
import * as c from '../controllers/leave.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { canReadLeaveDocument } from '../services/leave.service.js';
import { idParams } from '../utils/http.js';
import type { Op } from '../utils/openapi.js';
import { documentUpload, registerDocumentAccess } from '../utils/upload.js';
import { approveBody, balanceUpdateBody, balancesQuery, createLeaveBody, listLeaveQuery, rejectBody } from '../validators/leave.validator.js';

registerDocumentAccess(canReadLeaveDocument);

export function leaveRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), validate({ query: listLeaveQuery }), c.list);
  r.post('/', authorize('leave.request'), documentUpload.single('document'), validate({ body: createLeaveBody }), c.create);
  r.get('/:id', authorize('leave.read'), validate({ params: idParams }), c.get);
  r.put('/:id/approve', authorize('leave.approve'), validate({ params: idParams, body: approveBody }), c.approve);
  r.put('/:id/reject', authorize('leave.approve'), validate({ params: idParams, body: rejectBody }), c.reject);
  r.put('/:id/cancel', authorize('leave.read'), validate({ params: idParams }), c.cancel);
  return r;
}

export function leaveBalanceRoutes() {
  const r = Router();
  r.use(authenticate);
  r.get('/', authorize('leave.read'), validate({ query: balancesQuery }), c.balances);
  r.put('/:id', authorize('leave.manage'), validate({ params: idParams, body: balanceUpdateBody }), c.updateBalance);
  return r;
}

export const leaveDocs: Op[] = [
  { method: 'get', path: '/api/leave-requests', tag: 'Leave', summary: 'Leave requests in scope (mine / toApprove filters)', permission: 'leave.read', query: listLeaveQuery },
  { method: 'post', path: '/api/leave-requests', tag: 'Leave', summary: 'Submit a leave request (multipart, optional document)', permission: 'leave.request', multipart: { leaveTypeId: 'string', startDate: 'string', endDate: 'string', halfDay: 'string', reason: 'string', document: 'binary' }, status: 201 },
  { method: 'get', path: '/api/leave-requests/:id', tag: 'Leave', summary: 'Leave request detail', permission: 'leave.read' },
  { method: 'put', path: '/api/leave-requests/:id/approve', tag: 'Leave', summary: 'Approve a pending request', permission: 'leave.approve', body: approveBody },
  { method: 'put', path: '/api/leave-requests/:id/reject', tag: 'Leave', summary: 'Reject a pending request (note required)', permission: 'leave.approve', body: rejectBody },
  { method: 'put', path: '/api/leave-requests/:id/cancel', tag: 'Leave', summary: 'Cancel own pending/future request', permission: 'leave.read' },
  { method: 'get', path: '/api/leave-balances', tag: 'Leave', summary: 'Leave balances per type for a year', permission: 'leave.read', query: balancesQuery },
  { method: 'put', path: '/api/leave-balances/:id', tag: 'Leave', summary: 'Adjust entitlement', permission: 'leave.manage', body: balanceUpdateBody },
];
