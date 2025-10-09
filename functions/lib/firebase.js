let admin = require('firebase-admin');

function getAdmin() {
    return admin;
}

function setAdminForTests(mock) {
    admin = mock;
}

module.exports = {
    getAdmin,
    setAdminForTests
};
