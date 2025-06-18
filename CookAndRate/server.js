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
      // console.log('Chef encontrado:', responseData.user);
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

// Ruta para obtener 10 recetas aleatorias
app.get('/read-recetas', async (req, res) => {
  try {
    // 1. Primero obtenemos las recetas básicas con info del chef
    const recetasQuery = `
      SELECT 
        r.ID_Receta,
        r.Titulo AS Titulo_Receta,
        r.Descripcion,
        r.Tiempo_Preparacion,
        r.Dificultad,
        r.Fecha_Publicacion AS Fecha_Creacion,
        r.ID_Chef,
        u.ID_Usuario,
        u.Nombre AS Chef_Nombre,
        u.Ape_Pat AS Chef_ApellidoPaterno,
        u.Ape_Mat AS Chef_ApellidoMaterno,
        u.Email AS Chef_Email,
        u.Imagen AS Chef_Imagen,
        u.Tipo_Usuario,
        u.Biografia AS Chef_Biografia
      FROM Receta r
      JOIN Chef c ON r.ID_Chef = c.ID_Chef
      JOIN Usuario u ON c.ID_Usuario = u.ID_Usuario
      ORDER BY RAND()
    `;

    const [recetas] = await pool.query(recetasQuery);

    // 2. Para cada receta, obtenemos sus relaciones
    const resultados = await Promise.all(recetas.map(async (receta) => {
      // Obtener ingredientes
      const [ingredientes] = await pool.query(
        'SELECT Nombre, Cantidad, Unidad_Medida FROM Ingrediente WHERE ID_Receta = ?',
        [receta.ID_Receta]
      );

      // Obtener pasos
      const [pasos] = await pool.query(
        'SELECT Numero_Paso, Descripcion FROM Paso WHERE RecetaID_Receta = ? ORDER BY Numero_Paso',
        [receta.ID_Receta]
      );

      // Obtener imágenes
      const [imagenes] = await pool.query(
        'SELECT URL FROM Foto WHERE ID_Receta = ?',
        [receta.ID_Receta]
      );

      // Obtener certificaciones del chef
      const [certificaciones] = await pool.query(
        'SELECT Nombre FROM Certificacion_Chef WHERE ID_Chef = ?',
        [receta.ID_Chef]
      );

      // Obtener especialidades del chef
      const [especialidades] = await pool.query(
        'SELECT Nombre FROM Especialidad_Chef WHERE ID_Chef = ?',
        [receta.ID_Chef]
      );

      // Estructurar los datos
      return {
        id: receta.ID_Receta,
        titulo: receta.Titulo_Receta,
        descripcion: receta.Descripcion,
        tiempoPreparacion: receta.Tiempo_Preparacion,
        dificultad: receta.Dificultad,
        fechaCreacion: receta.Fecha_Creacion,
        ingredientes: ingredientes.reduce((obj, item) => {
          obj[item.Nombre] = item.Cantidad;
          return obj;
        }, {}),
        pasos: pasos.map(paso => paso.Descripcion),
        imagenes: imagenes.map(img => img.URL),
        chef: {
          id: receta.ID_Chef,
          usuarioId: receta.ID_Usuario,
          nombreCompleto: `${receta.Chef_Nombre} ${receta.Chef_ApellidoPaterno} ${receta.Chef_ApellidoMaterno}`.trim(),
          nombre: receta.Chef_Nombre,
          apellidoPaterno: receta.Chef_ApellidoPaterno,
          apellidoMaterno: receta.Chef_ApellidoMaterno,
          email: receta.Chef_Email,
          imagen: receta.Chef_Imagen || 'cheficon.jpg',
          tipoUsuario: receta.Tipo_Usuario,
          biografia: receta.Chef_Biografia,
        }
      };
    }));

    res.json({
      success: true,
      recetas: resultados
    });

  } catch (error) {
    console.error('Error al obtener recetas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener recetas',
      error: error.message
    });
  }
});

// Ruta para obtener interacciones
app.get('/api/interacciones/:recetaId', async (req, res) => {
  try {
    const { recetaId } = req.params;
    
    const [result] = await pool.query(`
      SELECT 
        SUM(CASE WHEN Tipo = 'Me gusta' THEN 1 ELSE 0 END) as meGusta,
        SUM(CASE WHEN Tipo = 'No me gusta' THEN 1 ELSE 0 END) as noMeGusta,
        SUM(CASE WHEN Tipo = 'Me encanta' THEN 1 ELSE 0 END) as meEncanta
      FROM Interacciones
      WHERE RecetaID_Receta = ?
    `, [recetaId]);
    
    res.json({
      success: true,
      interacciones: {
        meGusta: result[0].meGusta || 0,
        noMeGusta: result[0].noMeGusta || 0,
        meEncanta: result[0].meEncanta || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener interacciones'
    });
  }
});

// Ruta para OBTENER interacciones de una receta
app.get('/get-interacciones/:recetaId', async (req, res) => {
  try {
    const { recetaId } = req.params;
    // console.log('Receta ID:', recetaId);
    // Obtener totales
    const [totales] = await pool.query(`
      SELECT 
        SUM(CASE WHEN Tipo = 'Me gusta' THEN 1 ELSE 0 END) as meGusta,
        SUM(CASE WHEN Tipo = 'No me gusta' THEN 1 ELSE 0 END) as noMeGusta,
        SUM(CASE WHEN Tipo = 'Me encanta' THEN 1 ELSE 0 END) as meEncanta
      FROM Interaccion
      WHERE RecetaID_Receta = ?
    `, [recetaId]);

    // Obtener detalles de usuarios
    const [usuarios] = await pool.query(`
      SELECT 
        UsuarioID_Usuario as userId,
        Tipo,
        RecetaID_Receta as recetaId
      FROM Interaccion
      WHERE RecetaID_Receta = ?
    `, [recetaId]);
    
    res.json({
      success: true,
      interacciones: {
        meGusta: totales[0].meGusta || 0,
        noMeGusta: totales[0].noMeGusta || 0,
        meEncanta: totales[0].meEncanta || 0,
        usuarios: usuarios
      }
    });
    // console.log('Interacciones obtenidas:', {
    //   meGusta: totales[0].meGusta || 0,
    //   noMeGusta: totales[0].noMeGusta || 0,
    //   meEncanta: totales[0].meEncanta || 0,
    //   usuarios
    // });
  } catch (error) {
    console.error('Error al obtener interacciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interacciones'
    });
  }
});

// Registrar interacciones
app.post('/get-interacciones', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { recetaId, tipo, usuarioId } = req.body;
    // console.log('Datos recibidos:', { recetaId, tipo, usuarioId });

    // 1. Generar nuevo ID - ordenar numéricamente, no alfabéticamente
    const [ultimoId] = await connection.query(`
      SELECT ID_Interaccion 
      FROM Interaccion 
      WHERE ID_Interaccion LIKE 'INT-%'
      ORDER BY CAST(SUBSTRING(ID_Interaccion, 5) AS UNSIGNED) DESC 
      LIMIT 1
    `);
    
    // console.log('Último ID de interacción:', ultimoId);
    
    const nuevoNumero = ultimoId.length > 0 
      ? parseInt(ultimoId[0].ID_Interaccion.split('-')[1]) + 1 
      : 1;
    const nuevoId = `INT-${String(nuevoNumero).padStart(4, '0')}`;
    // console.log('Nuevo ID generado:', nuevoId);

    const tipoA = {
      'noMeGusta': 'No me gusta',
      'meGusta': 'Me gusta',
      'meEncanta': 'Me encanta'
    };
    // 2. Manejar interacción existente
    const [existente] = await connection.query(
      'SELECT ID_Interaccion, Tipo FROM Interaccion WHERE UsuarioID_Usuario = ? AND RecetaID_Receta = ?',
      [usuarioId, recetaId]
    );

    if (existente.length > 0) {
      if (existente[0].Tipo === tipoA[tipo]) {
        await connection.query(
          'DELETE FROM Interaccion WHERE ID_Interaccion = ?',
          [existente[0].ID_Interaccion]
        );
      } else {
        await connection.query(
          'UPDATE Interaccion SET Tipo = ?, Fecha_interaccion = NOW() WHERE ID_Interaccion = ?',
          [tipoA[tipo], existente[0].ID_Interaccion]
        );
      }
    } else {
      await connection.query(
        'INSERT INTO Interaccion (ID_Interaccion, UsuarioID_Usuario, RecetaID_Receta, Tipo, Fecha_interaccion) VALUES (?, ?, ?, ?, NOW())',
        [nuevoId, usuarioId, recetaId, tipoA[tipo]]
      );
      // console.log('Nueva interacción registrada:', nuevoId);
    }

    // 3. Obtener totales actualizados
    const [totales] = await connection.query(`
      SELECT 
        SUM(CASE WHEN Tipo = 'Me encanta' THEN 1 ELSE 0 END) as meEncanta,
        SUM(CASE WHEN Tipo = 'Me gusta' THEN 1 ELSE 0 END) as meGusta,
        SUM(CASE WHEN Tipo = 'No me gusta' THEN 1 ELSE 0 END) as noMeGusta
      FROM Interaccion
      WHERE RecetaID_Receta = ?
    `, [recetaId]);

    await connection.commit();
    
    res.json({
      success: true,
      nuevoTotal: {
        meEncanta: totales[0].meEncanta || 0,
        meGusta: totales[0].meGusta || 0,
        noMeGusta: totales[0].noMeGusta || 0
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al registrar interacción:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar interacción',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// Ruta para obtener calificaciones de una receta
app.get('/get-calificaciones/:recetaId', async (req, res) => {
  try {
    const { recetaId } = req.params;
    
    // Obtener todas las calificaciones para esta receta
    const [calificaciones] = await pool.query(`
      SELECT 
        c.Calificacion,
        c.ID_Receta AS recetaId,
        ch.ID_Usuario AS userId
      FROM Calificacion c
      JOIN Receta r ON c.ID_Receta = r.ID_Receta
      JOIN Chef ch ON r.ID_Chef = ch.ID_Chef
      JOIN Usuario u ON ch.ID_Usuario = u.ID_Usuario
      WHERE c.ID_Receta = ?
    `, [recetaId]);

    res.json({
      success: true,
      calificaciones: calificaciones
    });
    console.log('Calificaciones obtenidas:', calificaciones);
  } catch (error) {
    console.error('Error al obtener calificaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener calificaciones'
    });
  }
});

app.post('/guardar-calificacion', async (req, res) => {
    const { recetaId, calificacion, usuarioId } = req.body;

    // Validación básica
    if (!recetaId || !usuarioId || calificacion < 1 || calificacion > 5) {
        return res.status(400).json({ 
            success: false,
            message: 'Datos inválidos' 
        });
    }

    try {
        // Verificar si ya existe una calificación del usuario
        const [existente] = await pool.query(
            `SELECT c.* 
             FROM Calificacion c
             JOIN Receta r ON c.ID_Receta = r.ID_Receta
             JOIN Chef ch ON r.ID_Chef = ch.ID_Chef
             WHERE c.ID_Receta = ? AND ch.ID_Usuario = ?`, 
            [recetaId, usuarioId]
        );

        if (existente.length > 0) {
            // Actualizar calificación existente
            await pool.query(
                `UPDATE Calificacion c
                 JOIN Receta r ON c.ID_Receta = r.ID_Receta
                 JOIN Chef ch ON r.ID_Chef = ch.ID_Chef
                 SET c.Calificacion = ?, 
                     c.fecha = NOW() 
                 WHERE c.ID_Receta = ? AND ch.ID_Usuario = ?`,
                [calificacion, recetaId, usuarioId]
            );
        } else {
            // Crear nueva calificación
            // Primero necesitamos obtener el ID_Chef asociado al usuario que califica
            const [chef] = await pool.query(
                `SELECT ID_Chef FROM Chef WHERE ID_Usuario = ?`,
                [usuarioId]
            );
            
            if (chef.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Usuario no tiene perfil de chef'
                });
            }

            await pool.query(
                `INSERT INTO Calificacion 
                 (ID_Receta, ID_Chef, Calificacion, fecha) 
                 VALUES (?, ?, ?, NOW())`,
                [recetaId, chef[0].ID_Chef, calificacion]
            );
        }

        // Obtener las calificaciones actualizadas
        const [calificacionesActualizadas] = await pool.query(`
            SELECT 
                c.Calificacion,
                c.ID_Receta AS recetaId,
                ch.ID_Usuario AS userId
            FROM Calificacion c
            JOIN Receta r ON c.ID_Receta = r.ID_Receta
            JOIN Chef ch ON r.ID_Chef = ch.ID_Chef
            JOIN Usuario u ON ch.ID_Usuario = u.ID_Usuario
            WHERE c.ID_Receta = ?
        `, [recetaId]);

        res.json({ 
            success: true,
            calificaciones: calificacionesActualizadas,
            message: 'Calificación guardada exitosamente'
        });

    } catch (error) {
        console.error('Error en /guardar-calificacion:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error en el servidor al guardar calificación' 
        });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});