const express = require('express');
const path = require('path');
const app = express();

// Servir archivos estáticos del dashboard (index.html, styles.css, app.js)
app.use(express.static(__dirname));

// Endpoint para proveer el archivo Excel al frontend de forma segura
app.get('/api/excel', (req, res) => {
    const excelPath = path.join(__dirname, 'QUERY.xlsx');;
    res.sendFile(excelPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 SERVIDOR INGENTRON INICIADO`);
    console.log(`======================================================`);
    console.log(`\nEl dashboard está disponible en tu computadora local en:`);
    console.log(`-> http://localhost:${PORT}`);
    console.log(`\nPara que otras computadoras lo vean, dales la IP de esta PC.`);
    console.log(`(Asegúrate de no cerrar esta ventana mientras quieras que el sistema funcione)`);
});
