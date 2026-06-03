const firebird = require('./node_modules/node-firebird');

const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Users\\Usuario\\Desktop\\Tomcat 9.0\\1_ERP.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true
};

console.log("Connecting to Firebird to test client/supplier query...");
firebird.attach(options, function(err, db) {
    if (err) {
        console.error("Connection failed:", err);
        process.exit(1);
    }
    
    // Check if 23507 shows up in the current server.js query
    const q1 = `
    SELECT 
        p.NUMERO AS client_code,
        p.NOMBRE AS client_name,
        p.DTYPE AS client_dtype,
        cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS outstanding_balance
    FROM COMPROBANTE c
    JOIN COMPROBANTEIDENTIFICACION ci ON c.COMPROBANTEIDENTIFICACION_OID = ci.OID
    JOIN TIPOCOMPROBANTE t ON c.TIPOCOMPROBANTE_OID = t.OID
    JOIN CONTRAPARTIDA cp ON cp.COMPROBANTE_OID = c.OID AND cp.TIPOCONTRAPARTIDA_OID = 5
    JOIN CUENTACORRIENTE ct ON cp.CUENTACORRIENTE_OID = ct.OID
    JOIN PERSONA p ON ct.PROPIETARIO_OID = p.OID
    WHERE cp.IMPORTE > 0 
      AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
      AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
      AND p.NUMERO = '23507'
    `;
    
    db.query(q1, function(err, results) {
        if (err) {
            console.error("Query 1 failed:", err);
            db.detach();
            process.exit(1);
        }
        console.log("Grupo Peñaflor records found in current query:", results);
        
        // Count how many total records are 'Proveedor' in the current outstanding balance query
        const q2 = `
        SELECT 
            p.DTYPE AS client_dtype,
            COUNT(*) AS cnt
        FROM COMPROBANTE c
        JOIN COMPROBANTEIDENTIFICACION ci ON c.COMPROBANTEIDENTIFICACION_OID = ci.OID
        JOIN TIPOCOMPROBANTE t ON c.TIPOCOMPROBANTE_OID = t.OID
        JOIN CONTRAPARTIDA cp ON cp.COMPROBANTE_OID = c.OID AND cp.TIPOCONTRAPARTIDA_OID = 5
        JOIN CUENTACORRIENTE ct ON cp.CUENTACORRIENTE_OID = ct.OID
        JOIN PERSONA p ON ct.PROPIETARIO_OID = p.OID
        WHERE cp.IMPORTE > 0 
          AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
          AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
        GROUP BY p.DTYPE
        `;
        
        db.query(q2, function(err, results2) {
            if (err) {
                console.error("Query 2 failed:", err);
                db.detach();
                process.exit(1);
            }
            console.log("\nOutstanding records grouped by PERSONA.DTYPE:");
            console.log(results2);
            db.detach();
        });
    });
});
