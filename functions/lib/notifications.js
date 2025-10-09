const {getAdmin} = require('./firebase');

async function queueEmail({to, template, data}, {adminOverride} = {}) {
    if (!to) {
        return null;
    }
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    return db.collection('mailQueue').add({
        to,
        template,
        data: data || {},
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

module.exports = {
    queueEmail
};
