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
SELECT FIRST 10 
    c.OID AS invoice_oid,
    p.NUMERO AS client_code,
    p.NOMBRE AS client_name,
    t.NOMBRE AS doc_type,
    ci.LETRA || ' ' || ci.NUMEROSERIE || '-' || ci.ALNUMERO AS doc_number,
    c.FECHA AS doc_date,
    c.FECHAVENCIMIENTO AS due_date,
    cp.IMPORTE AS total_amount,
    COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS paid_amount,
    cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS outstanding_balance
FROM COMPROBANTE c
JOIN COMPROBANTEIDENTIFICACION ci ON c.COMPROBANTEIDENTIFICACION_OID = ci.OID
JOIN TIPOCOMPROBANTE t ON c.TIPOCOMPROBANTE_OID = t.OID
JOIN CONTRAPARTIDA cp ON cp.COMPROBANTE_OID = c.OID AND cp.TIPOCONTRAPARTIDA_OID = 5
JOIN CUENTACORRIENTE ct ON cp.CUENTACORRIENTE_OID = ct.OID
JOIN PERSONA p ON ct.PROPIETARIO_OID = p.OID
WHERE cp.IMPORTE > 0 AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
ORDER BY outstanding_balance DESC
`;

console.log("Connecting...");
firebird.attach(options, function(err, db) {
    if (err) {
        console.error("Connection failed:", err);
        process.exit(1);
    }
    console.log("Connected. Querying invoice balances...");
    db.query(query, function(err, results) {
        if (err) {
            console.error("Query failed:", err);
            db.detach();
            process.exit(1);
        }
        console.log("Results (first 10):");
        results.forEach((row, i) => {
            console.log(`${i+1}: Code=${row.client_code} Name=${row.client_name} Doc=${row.doc_number} Date=${row.doc_date} Due=${row.due_date} Outstanding=${row.outstanding_balance}`);
        });
        db.detach();
    });
});
