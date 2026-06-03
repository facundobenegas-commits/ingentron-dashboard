const firebird = require('./node_modules/node-firebird');

const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Users\\Usuario\\Desktop\\Tomcat 9.0\\1_ERP.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true // returns keys in lowercase
};

console.log("Connecting to Firebird database at 127.0.0.1:3050...");
firebird.attach(options, function(err, db) {
    if (err) {
        console.error("Error connecting to database:", err);
        process.exit(1);
    }
    
    console.log("Connected successfully! Running query...");
    db.query("SELECT OID, NOMBRE FROM EMPRESA", function(err, result) {
        if (err) {
            console.error("Error running query:", err);
            db.detach();
            process.exit(1);
        }
        
        console.log("Query results:", result);
        db.detach();
        console.log("Disconnected.");
    });
});
