const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Configuración de la conexión a MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || '192.168.1.48',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '243537',
  database: process.env.DB_NAME || 'CookAndRate',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


const userIconsDir = path.join(__dirname, 'userIcons');

if (!fs.existsSync(userIconsDir)) {
    fs.mkdirSync(userIconsDir, { recursive: true });
}

app.use('/userIcons', (req, res, next) => {
    const filePath = path.join(__dirname, 'userIcons', req.url);
    
    // Verificar si el archivo existe
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // Servir imagen por defecto o enviar error 404
            res.status(404).json({ 
                error: 'Imagen no encontrada',
                requestedFile: req.url,
                fullPath: filePath
            });
        } else {
            next();
        }
    });
}, express.static(path.join(__dirname, 'userIcons')));

app.get('/api/list-images', (req, res) => {
    fs.readdir(userIconsDir, (err, files) => {
        if (err) {
            res.status(500).json({ error: 'No se puede leer el directorio' });
        } else {
            const images = files.filter(file => 
                /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
            );
            res.json({ 
                directory: userIconsDir,
                images: images,
                totalFiles: files.length
            });
        }
    });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, userIconsDir);
    },
    filename: (req, file, cb) => {
        // Mantener nombre original o generar uno único
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'));
        }
    }
});

function createDefaultImages() {
    const defaultChefIcon = path.join(userIconsDir, 'cheficon.jpg');
    const defaultCriticIcon = path.join(userIconsDir, 'crticon.png');
    
    // Verificar si existen las imágenes por defecto
    if (!fs.existsSync(defaultChefIcon)) {
        console.log('⚠️  cheficon.jpg no existe');
        // Aquí podrías copiar una imagen por defecto o crearla
    }
    
    if (!fs.existsSync(defaultCriticIcon)) {
        console.log('⚠️  crticon.png no existe');
        // Aquí podrías copiar una imagen por defecto o crearla
    }
}

// Llamar la función al iniciar
createDefaultImages();

// Ruta de prueba de conexión
app.get('/api/test-connection', async (req, res) => {
  console.log('📡 Intentando conectar a la base de datos...');
  
  try {
    const [results] = await pool.query('SELECT 1 as test');
    console.log('✅ Conexión exitosa a MySQL');
    res.json({ 
      status: 'success',
      message: 'Conexión exitosa a MySQL',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    res.status(500).json({ 
      status: 'error',
      message: 'No se puede conectar a la base de datos',
      details: err.message
    });
  }
});

// Ruta de login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await pool.query(
            'SELECT ID_Usuario as ID_User, Email, Password as Contrasena, CAST(Estado AS UNSIGNED) as Estado FROM Usuario WHERE Email = ?',
            [email]
        );

        const user = users[0]; 

        if (user && user.Estado === 1) { 
            if (password === user.Contrasena) { 
                const token = jwt.sign(
                    { 
                        userId: user.ID_User, 
                        email: user.Email 
                    },
                    process.env.JWT_SECRET || 'd4e8b87547fe0d3a8ba82cbfd02bb11e0b7d34554b383ced776fe215eec9e849',
                    { expiresIn: '8h' }
                );

                res.json({
                    user: {
                        ID_User: user.ID_User,
                        Email: user.Email
                    },
                    message: "ACC",
                    token
                });
            } else {
                res.status(200).json({ message: 'COI' });
            }
        } else {
            res.status(200).json({ message: 'UNE' });
        }
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ruta para encontrar usuario por ID - MEJORADA
app.post('/find-user-by-id', async (req, res) => {
    try {
        const { userId } = req.body;
        
        const [users] = await pool.query(
            'SELECT * FROM Usuario WHERE ID_Usuario = ?', 
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = users[0];
        const responseData = { user };
        
        // Obtener la URL base del servidor
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        // console.log('Usuario encontrado:', user);
        
        if (user.Tipo_Usuario === 'chef') {
            const [chefs] = await pool.query(
                'SELECT * FROM Chef WHERE ID_Usuario = ?',
                [userId]
            );
            responseData.chef = chefs[0];
            
            // Verificar si la imagen existe antes de asignarla
            const chefIconPath = path.join(userIconsDir, 'cheficon.jpg');
            if (fs.existsSync(chefIconPath)) {
                responseData.icon = `${baseUrl}/userIcons/cheficon.jpg`;
                console.log('✅ Imagen de chef asignada:', responseData.icon);
            } else {
                responseData.icon = null;
                console.log('❌ cheficon.jpg no existe');
            }
            
            console.log('Chef encontrado:', responseData.chef);
            
            // Obtener recetas del chef
            const [recetas] = await pool.query(
                'SELECT * FROM Receta WHERE ID_Chef = ?',
                [responseData.chef.ID_Chef]
            );
            responseData.recetas = recetas;

            // Obtener certificaciones del chef
            const [certificaciones] = await pool.query(
                'SELECT * FROM Certificacion_Chef WHERE ID_Chef = ?',
                [responseData.chef.ID_Chef]
            );
            responseData.certificaciones = certificaciones;

            // Obtener especialidades del chef
            const [especialidades] = await pool.query(
                'SELECT * FROM Especialidad_Chef WHERE ID_Chef = ?',
                [responseData.chef.ID_Chef]
            );
            responseData.especialidades = especialidades;

        } else if (user.Tipo_Usuario === 'critico') {
            const [criticos] = await pool.query(
                'SELECT * FROM Critico WHERE ID_Usuario = ?',
                [userId]
            );
            responseData.critico = criticos[0];
            
            // Verificar si la imagen existe antes de asignarla
            const criticIconPath = path.join(userIconsDir, 'crticon.png');
            if (fs.existsSync(criticIconPath)) {
                responseData.icon = `${baseUrl}/userIcons/crticon.png`;
                console.log('✅ Imagen de crítico asignada:', responseData.icon);
            } else {
                responseData.icon = null;
                console.log('❌ crticon.png no existe');
            }
            
            console.log('Crítico encontrado:', responseData.critico);
            
            // Obtener certificaciones del crítico
            const [certificaciones] = await pool.query(
                'SELECT * FROM Certificacion_Critico WHERE ID_Critico = ?',
                [responseData.critico.ID_Critico]
            );
            responseData.certificaciones = certificaciones;

            // Obtener especialidades del crítico
            const [especialidades] = await pool.query(
                'SELECT * FROM Especialidad_Critico WHERE ID_Critico = ?',
                [responseData.critico.ID_Critico]
            );
            responseData.especialidades = especialidades;
        }

        // Obtener redes sociales
        const [redesSociales] = await pool.query(
            'SELECT * FROM Red_Social WHERE ID_Usuario = ?',
            [userId]
        );
        responseData.redesSociales = redesSociales;

        res.json(responseData);
        console.log('Datos del usuario enviados - Icon:', responseData.icon);   
    } catch (error) {
        console.error('Error al buscar usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Ruta para subir imagen de usuario
app.post('/api/upload-user-icon', upload.single('userIcon'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const { userId } = req.body;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/userIcons/${req.file.filename}`;

        console.log('Imagen subida:', req.file.filename);
        console.log('URL generada:', imageUrl);

        // Actualizar la base de datos con la nueva imagen (opcional)
        // await pool.query(
        //     'UPDATE Usuario SET Imagen_Perfil = ? WHERE ID_Usuario = ?',
        //     [imageUrl, userId]
        // );

        res.json({
            success: true,
            imageUrl: imageUrl,
            filename: req.file.filename,
            message: 'Imagen subida correctamente'
        });
    } catch (error) {
        console.error('Error al subir imagen:', error);
        res.status(500).json({ error: 'Error al subir la imagen' });
    }
});

// Top 3 recetas más valoradas
app.get('/top-3-recetas', async (req, res) => {
    try {
        const query = `
            SELECT 
                r.ID_Receta,
                r.Titulo AS Nombre,
                r.Descripcion,
                r.Tiempo_Preparacion,
                r.Dificultad,
                f.URL AS Imagen,
                AVG(c.Calificacion) AS Puntuacion_Promedio,
                u.Nombre AS Chef_Nombre,
                u.Ape_Pat AS Chef_Apellido
            FROM Receta r
            LEFT JOIN Calificacion c ON r.ID_Receta = c.ID_Receta
            LEFT JOIN Foto f ON r.ID_Receta = f.ID_Receta
            LEFT JOIN Chef ch ON r.ID_Chef = ch.ID_Chef
            LEFT JOIN Usuario u ON ch.ID_Usuario = u.ID_Usuario
            GROUP BY 
                r.ID_Receta,
                r.Titulo,
                r.Descripcion,
                r.Tiempo_Preparacion,
                r.Dificultad,
                f.URL,
                u.Nombre,
                u.Ape_Pat
            ORDER BY Puntuacion_Promedio DESC
            LIMIT 3;
        `;

        const [recetas] = await pool.query(query);
        console.log('Recetas obtenidas:', recetas);
        // Procesar resultados para asegurar una imagen por receta
        const top3Recetas = recetas.map(receta => ({
            ...receta,
            Imagen: receta.Imagen || 'default-recipe.jpg' // Imagen por defecto si no hay
        }));

        res.json({
            success: true,
            top3Recetas
        });
        console.log('Top 3 recetas obtenidas:', top3Recetas);
    } catch (error) {
        console.error('Error al obtener top 3 recetas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener las recetas mejor calificadas'
        });
    }
});

//Rutas Sio


// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});