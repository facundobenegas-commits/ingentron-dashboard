const firebird = require('./node_modules/node-firebird');

const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Users\\Usuario\\Desktop\\Tomcat 9.0\\1_ERP.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true
};

const query = `
SELECT OID, NOMBRE, NUMERO, PUESTODEVENTA_OID FROM TALONARIO
ORDER BY OID
`;

console.log("Connecting to Firebird...");
firebird.attach(options, function(err, db) {
    if (err) {
        console.error("Connection failed:", err);
        process.exit(1);
    }
    console.log("Connected. Querying all talonarios...");
    db.query(query, function(err, results) {
        if (err) {
            console.error("Query failed:", err);
            db.detach();
            process.exit(1);
        }
        console.log(`Found ${results.length} talonarios:`);
        results.forEach((row, i) => {
            console.log(`OID=${row.oid} Nombre=${row.nombre} Numero=${row.numero} PuestoDeVenta=${row.puestodeventa_oid}`);
        });
        db.detach();
    });
});
