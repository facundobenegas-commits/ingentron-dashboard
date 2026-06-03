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
SELECT 
    c.OID AS invoice_oid,
    c.TALONARIO_OID AS talonario_id,
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
WHERE (p.NUMERO = '688' OR p.NOMBRE LIKE '%FERRERO%')
  AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
  AND cp.IMPORTE > 0 
  AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
ORDER BY c.FECHA ASC
`;

console.log("Connecting to Firebird...");
firebird.attach(options, function(err, db) {
    if (err) {
        console.error("Connection failed:", err);
        process.exit(1);
    }
    console.log("Connected. Querying OUTSTANDING records by TIPOCOMPROBANTE for FERRERO HNOS...");
    db.query(query, function(err, results) {
        if (err) {
            console.error("Query failed:", err);
            db.detach();
            process.exit(1);
        }
        console.log(`Found ${results.length} outstanding records:`);
        results.forEach((row, i) => {
            console.log(`${i+1}: Doc=${row.doc_type} Num=${row.doc_number} Talonario=${row.talonario_id} Date=${row.doc_date} Amount=${row.total_amount} Paid=${row.paid_amount} Bal=${row.outstanding_balance}`);
        });
        db.detach();
    });
});
