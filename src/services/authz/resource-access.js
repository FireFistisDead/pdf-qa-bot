const { dbGet } = require('../../db/db');
const { logEvent } = require('../security/audit');

const verifyDocumentOwnership = async (userId, documentId) => {
  const doc = await dbGet('SELECT user_id FROM documents WHERE id = ?', [documentId]);
  if (!doc) {
    return false; // Document doesn't exist
  }
  if (doc.user_id !== userId) {
    await logEvent('cross_tenant_access_attempt', { userId, resource: 'document', resourceId: documentId });
    return false;
  }
  return true;
};

const verifyChatSessionOwnership = async (userId, sessionId) => {
  const session = await dbGet('SELECT user_id FROM chat_sessions WHERE id = ?', [sessionId]);
  if (!session) {
    return false;
  }
  if (session.user_id !== userId) {
    await logEvent('cross_tenant_access_attempt', { userId, resource: 'chat_session', resourceId: sessionId });
    return false;
  }
  return true;
};

const authorizeDocument = async (req, res, next) => {
  const documentId = req.params.documentId || req.body.document_id;
  if (!documentId) return next();

  const isOwner = await verifyDocumentOwnership(req.user.id, documentId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Forbidden: You do not have access to this document' });
  }
  next();
};

const authorizeSession = async (req, res, next) => {
  const sessionId = req.params.sessionId || req.body.session_id;
  if (!sessionId) return next();

  const isOwner = await verifyChatSessionOwnership(req.user.id, sessionId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Forbidden: You do not have access to this session' });
  }
  next();
};

module.exports = {
  verifyDocumentOwnership,
  verifyChatSessionOwnership,
  authorizeDocument,
  authorizeSession
};
