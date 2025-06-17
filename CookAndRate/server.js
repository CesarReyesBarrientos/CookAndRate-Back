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
  host: process.env.DB_HOST || '192.168.1.15',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '243537',
  database: process.env.DB_NAME || 'CookAndRate',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Configuración de directorios de imágenes
const imgDir = path.join(__dirname, 'img');
const userIconsDir = path.join(imgDir, 'userIcons');
const recetasDir = path.join(imgDir, 'recetas');

// Crear directorios si no existen
[imgDir, userIconsDir, recetasDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Middleware para servir imágenes estáticas
app.use('/img/userIcons', express.static(userIconsDir));
app.use('/img/recetas', express.static(recetasDir));

// Configuración de Multer para imágenes de usuario
const userIconsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, userIconsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'user-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configuración de Multer para imágenes de recetas
const recetasStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recetasDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receta-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadUserIcon = multer({ 
  storage: userIconsStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

const uploadRecetaImage = multer({ 
  storage: recetasStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

// Función para crear imágenes por defecto
function createDefaultImages() {
  const defaultChefIcon = path.join(userIconsDir, 'cheficon.jpg');
  const defaultCriticIcon = path.join(userIconsDir, 'crticon.png');
  const defaultRecipeImage = path.join(recetasDir, 'default-recipe.jpg');
  
  // Verificar y crear imágenes por defecto si no existen
  if (!fs.existsSync(defaultChefIcon)) {
    console.log('⚠️ cheficon.jpg no existe - creando imagen por defecto');
    // Aquí podrías copiar una imagen por defecto o crearla
  }
  
  if (!fs.existsSync(defaultCriticIcon)) {
    console.log('⚠️ crticon.png no existe - creando imagen por defecto');
    // Aquí podrías copiar una imagen por defecto o crearla
  }

  if (!fs.existsSync(defaultRecipeImage)) {
    console.log('⚠️ default-recipe.jpg no existe - creando imagen por defecto');
    // Aquí podrías copiar una imagen por defecto o crearla
  }
}

// Llamar la función al iniciar
createDefaultImages();

app.get('/api/test-connection', async (req, res) => {
  try {
    const [results] = await pool.query('SELECT 1 as test');
    res.json({ 
      status: 'success',
      message: 'Conexión exitosa a MySQL',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
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
          { userId: user.ID_User, email: user.Email },
          process.env.JWT_SECRET || 'd4e8b87547fe0d3a8ba82cbfd02bb11e0b7d34554b383ced776fe215eec9e849',
          { expiresIn: '8h' }
        );

        res.json({
          user: { ID_User: user.ID_User, Email: user.Email },
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
    res.status(500).json({ error: error.message });
  }
});

// Ruta para encontrar usuario por ID
app.post('/find-user-by-id', async (req, res) => {
  try {
    const { userId } = req.body;
    const [users] = await pool.query('SELECT * FROM Usuario WHERE ID_Usuario = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = users[0];
    const responseData = { user };
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Asignar icono según tipo de usuario
    if (user.Tipo_Usuario === 'chef') {
      const [chefs] = await pool.query('SELECT * FROM Chef WHERE ID_Usuario = ?', [userId]);
      responseData.chef = chefs[0];
      // console.log('Imagen chef encontrado:', responseData.user);
      responseData.icon = responseData.user.Imagen 
          ? `${baseUrl}/img/userIcons/${responseData.user.Imagen}`
          : `${baseUrl}/img/userIcons/cheficon.jpg`;
      
      // Obtener recetas del chef con sus imágenes
      const [recetas] = await pool.query(
        `SELECT r.*, f.URL AS Imagen 
         FROM Receta r
         LEFT JOIN Foto f ON r.ID_Receta = f.ID_Receta
         WHERE r.ID_Chef = ?`,
        [responseData.chef.ID_Chef]
      );
      
      responseData.recetas = recetas.map(receta => ({
        ...receta,
        Imagen: receta.Imagen 
          ? receta.Imagen.startsWith('http') 
            ? receta.Imagen 
            : `${baseUrl}${receta.Imagen}`
          : `${baseUrl}/img/recetas/default-recipe.jpg`
      }));

      // Obtener certificaciones y especialidades del chef
      const [certificaciones] = await pool.query('SELECT * FROM Certificacion_Chef WHERE ID_Chef = ?', [responseData.chef.ID_Chef]);
      const [especialidades] = await pool.query('SELECT * FROM Especialidad_Chef WHERE ID_Chef = ?', [responseData.chef.ID_Chef]);
      responseData.certificaciones = certificaciones;
      responseData.especialidades = especialidades;

    } else if (user.Tipo_Usuario === 'critico') {
      const [criticos] = await pool.query('SELECT * FROM Critico WHERE ID_Usuario = ?', [userId]);
      responseData.critico = criticos[0];
      console.log('Chef encontrado:', responseData.user);
      responseData.icon = responseData.user.Imagen 
          ? `${baseUrl}/img/userIcons/${responseData.user.Imagen}`
          : `${baseUrl}/img/userIcons/crticon.jpg`;
      
      // Obtener certificaciones y especialidades del crítico
      const [certificaciones] = await pool.query('SELECT * FROM Certificacion_Critico WHERE ID_Critico = ?', [responseData.critico.ID_Critico]);
      const [especialidades] = await pool.query('SELECT * FROM Especialidad_Critico WHERE ID_Critico = ?', [responseData.critico.ID_Critico]);
      responseData.certificaciones = certificaciones;
      responseData.especialidades = especialidades;
    }

    // Obtener redes sociales
    const [redesSociales] = await pool.query('SELECT * FROM Red_Social WHERE ID_Usuario = ?', [userId]);
    responseData.redesSociales = redesSociales;

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para subir imagen de usuario
app.post('/api/upload-user-icon', uploadUserIcon.single('userIcon'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    const { userId } = req.body;
    const imageUrl = `/img/userIcons/${req.file.filename}`;

    res.json({
      success: true,
      imageUrl: imageUrl,
      filename: req.file.filename,
      message: 'Imagen de usuario subida correctamente'
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al subir la imagen de usuario' });
  }
});

// Ruta para subir imagen de receta
app.post('/api/upload-receta-image', uploadRecetaImage.single('recetaImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    const { recetaId } = req.body;
    const imageUrl = `/img/recetas/${req.file.filename}`;

    // Aquí puedes guardar la URL en la base de datos
    // await pool.query('INSERT INTO Foto (ID_Receta, URL) VALUES (?, ?)', [recetaId, imageUrl]);

    res.json({
      success: true,
      imageUrl: imageUrl,
      filename: req.file.filename,
      message: 'Imagen de receta subida correctamente'
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al subir la imagen de receta' });
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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const top3Recetas = recetas.map(receta => ({
      ...receta,
      Imagen: receta.Imagen 
        ? receta.Imagen.startsWith('http') 
          ? receta.Imagen 
          : `${baseUrl}${receta.Imagen}`
        : `${baseUrl}/img/recetas/default-recipe.jpg`
    }));

    res.json({ success: true, top3Recetas });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener las recetas mejor calificadas'
    });
  }
});

// Recetas aleatorias
// Ruta para obtener 10 recetas aleatorias
app.get('/api/recetas-aleatorias', async (req, res) => {
  try {
    // Consulta para obtener 10 recetas aleatorias con información del chef
    const query = `
      SELECT 
        r.*,
        u.Nombre AS Chef_Nombre,
        u.Ape_Pat AS Chef_Apellido,
        u.imagen AS Chef_Imagen,
        GROUP_CONCAT(f.URL) AS Imagenes
      FROM Receta r
      JOIN Chef c ON r.ID_Chef = c.ID_Chef
      JOIN Usuario u ON c.ID_Usuario = u.ID_Usuario
      LEFT JOIN Foto f ON r.ID_Receta = f.ID_Receta
      GROUP BY r.ID_Receta
      ORDER BY RAND()
      LIMIT 10
    `;

    const [recetas] = await pool.query(query);

    // Procesar los resultados
    const resultados = recetas.map(receta => ({
      ...receta,
      Imagenes: receta.Imagenes ? receta.Imagenes.split(',') : [],
      Chef: {
        Nombre: receta.Chef_Nombre,
        Apellido: receta.Chef_Apellido,
        Imagen: receta.Chef_Imagen || 'default.png'
      }
    }));

    res.json({
      success: true,
      recetas: resultados
    });
    console.log('Recetas aleatorias obtenidas correctamente', resultados);
  } catch (error) {
    console.error('Error al obtener recetas aleatorias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener recetas'
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});