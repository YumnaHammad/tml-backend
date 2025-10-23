const { AuditLog } = require('../models');

const createAuditLog = async (actorId, actorRole, action, resourceType, resourceId, oldValues = null, newValues = null, metadata = null, req = null) => {
  try {
    // Only create audit log if we have valid actorId
    if (!actorId || actorId === 'undefined') {
      console.log('Skipping audit log creation - no valid actorId');
      return;
    }

    const auditData = {
      actorId,
      actorRole,
      action,
      resourceType,
      resourceId,
      oldValues,
      newValues,
      ipAddress: req ? req.ip : null,
      userAgent: req ? req.get('User-Agent') : null,
      metadata
    };

    const auditLog = new AuditLog(auditData);
    await auditLog.save();
  } catch (error) {
    console.error('Audit log creation failed:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

const auditMiddleware = (action, resourceType) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    let responseBody = null;

    // Capture response body
    res.send = function(data) {
      responseBody = data;
      return originalSend.call(this, data);
    };

    // Execute the original route handler
    await new Promise((resolve) => {
      const originalNext = next;
      next = function(err) {
        if (err) {
          return resolve();
        }
        return resolve();
      };
      originalNext();
    });

    // Create audit log after successful operation
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
      try {
        let resourceId = req.params.id || req.body._id || req.body.id;
        
        // Extract resource ID from response if not available in request
        if (!resourceId && responseBody) {
          try {
            const parsed = JSON.parse(responseBody);
            resourceId = parsed._id || parsed.id;
          } catch (e) {
            // Response is not JSON, use request params
          }
        }

        if (resourceId) {
          await createAuditLog(
            req.user._id,
            req.user.role,
            action,
            resourceType,
            resourceId,
            null, // oldValues - would need to be captured before operation
            responseBody ? JSON.parse(responseBody) : null, // newValues
            { method: req.method, url: req.originalUrl },
            req
          );
        }
      } catch (error) {
        console.error('Audit middleware error:', error);
      }
    }

    next();
  };
};

module.exports = {
  createAuditLog,
  auditMiddleware
};
