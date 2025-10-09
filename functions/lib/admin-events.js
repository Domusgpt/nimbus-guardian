const {getAdmin} = require('./firebase');

async function recordAdminEvent(type, payload, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    await db.collection('adminEvents').add({
        type,
        payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

module.exports = {
    recordAdminEvent
};
