const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SECRET_KEY = '_Cx#';
const multer = require('multer');
const axios = require('axios');

const app = express();
const PORT = 3000;
const SPOONACULAR_API_KEY = '6026a2129b724ed683d7cbbe5eecff01'; 

app.use(cors());
app.use(express.json());  // Esto es necesario para poder leer req.body como JSON

const SHARED_DIR = '/mnt/nfs_share/DB';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Determine destination based on the route
        if (req.path === '/create-recipe') {
            cb(null, 'img/recetas/');
        } else if (req.path === '/update-user') {
            cb(null, 'img/userIcons/');
        } else {
            cb(new Error('Invalid upload destination'));
        }
    },
    filename: async (req, file, cb) => {
        try {
            let filename;
            
            if (req.path === '/create-recipe') {
                const userId = req.body.userId;
                
                if (!userId) {
                    return cb(new Error('El ID de usuario es obligatorio para crear receta'));
                }

                const extension = path.extname(file.originalname);
                filename = `recipe_${userId}_${Date.now()}${extension}`;
            } else if (req.path === '/update-user') {
                // Obtener el email del body de la solicitud
                const email = req.body.email;
                // console.log(email);
                if (!email) {
                    return cb(new Error('El email es obligatorio para actualizar imagen'));
                }

                // Obtener el userId basado en el email
                const userId = await getUserIdByEmail(email);
                console.log('userId obtenido:', userId);

                const extension = path.extname(file.originalname);
                filename = `${userId}${extension}`;
            } else {
                return cb(new Error('Ruta de carga no válida'));
            }
            
            cb(null, filename);
        } catch (error) {
            cb(error);
        }
    },
});

async function getUserIdByEmail(email) {
    try {
        // Lee el archivo users.txt
        const filePath = `${SHARED_DIR}/users.txt`;  // Usa la misma ruta que ya estás utilizando
        const content = await fs.readFile(filePath, 'utf8');
        const { users } = JSON.parse(content);

        // Buscar el usuario por email
        const user = users.find((u) => u.Email === email);
        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        // Retornar el ID del usuario
        return user.ID_User;
    } catch (error) {
        console.error('Error al obtener el ID de usuario:', error.message);
        throw error;  // Lanza el error para ser manejado por el código que llama a esta función
    }
}

const upload = multer({ storage });

app.get('/list-files', async (req, res) => {
    try {
        // Verificar si el directorio existe
        await fs.access(SHARED_DIR);
        console.log(`Accediendo al directorio: ${SHARED_DIR}`);
        
        // Leer los archivos dentro del directorio
        const files = await fs.readdir(SHARED_DIR);

        if (files.length === 0) {
            res.json({ message: 'El directorio está vacío.' });
        } else {
            // Retornar la lista de archivos como respuesta JSON
            res.json({ files });
        }
    } catch (error) {

        console.error('Error al acceder al directorio:', error.message);
        res.status(500).json({ error: 'No se pudo acceder al directorio o no existe.' });
    }
});

app.get('/read-users', async (req, res) => {
    try {
        const content = await fs.readFile(`${SHARED_DIR}/users.txt`, 'utf8');
		const { users } = JSON.parse(content);
        res.json({ users });
    }catch (error) {
        res.status(500).json({ error: error.message  });
    }
});

app.get('/', (req, res) => {
	res.send('¡Hola Mundo!');
});

app.use('/img', express.static(path.join(__dirname, 'img')));

app.get('/img-list', async (req, res) => {
    try {
      const files = await fs.readdir(path.join(__dirname, 'img', 'recetas'));
      res.json({ images: files.map(file => `http://localhost:3000/img/recetas/${file}`) });
    } catch (error) {
      res.status(500).json({ error: 'No se pudieron listar las imágenes.' });
    }
  });

// Endpoint para crear receta
app.post('/create-recipe', upload.array('imagenes', 5), async (req, res) => {
    try {
        const { userId, titulo, ingredientes, pasos } = req.body;
        if (!userId || !titulo || !ingredientes || !pasos) {
            return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
        }

        // Read users file
        const usersFilePath = `${SHARED_DIR}/users.txt`;
        const fileContent = await fs.readFile(usersFilePath, 'utf8');
        const { users } = JSON.parse(fileContent);

        // Find user by ID
        const user = users.find((u) => u.ID_User === userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // Read recipes file
        const recetasFilePath = `${SHARED_DIR}/recetas.txt`;
        const recetasContent = await fs.readFile(recetasFilePath, 'utf8');
        const recetasData = JSON.parse(recetasContent);

        // Read chefs file to verify if user is a chef
        const chefsFilePath = `${SHARED_DIR}/chefs.txt`;
        const chefsContent = await fs.readFile(chefsFilePath, 'utf8');
        const { chefs } = JSON.parse(chefsContent);
        
        // Find the chef associated with this user
        const chef = chefs.find(c => c.ID_User === userId);
        if (!chef) {
            return res.status(403).json({ success: false, message: 'Solo chefs pueden crear recetas' });
        }

        // Generate new recipe ID
        const newId = `REC${String(recetasData.recetas.length + 1).padStart(5, '0')}`;

        // Process images
        const imagenes = req.files ? req.files.map(file => file.filename) : [];

        // Create new recipe
        const nuevaReceta = {
            ID_Receta: newId,
            ID_Chef: chef.ID_Chef,
            Titulo_Receta: titulo,
            Ingredientes: JSON.parse(ingredientes),
            Pasos_Elaboracion: JSON.parse(pasos),
            Imagenes: imagenes,
            Comentarios: []
        };

        // Add recipe to the array
        recetasData.recetas.push(nuevaReceta);
        
        // Write back to file
        await fs.writeFile(recetasFilePath, JSON.stringify(recetasData, null, 4), 'utf8');

        res.status(201).json({ success: true, message: 'Receta creada exitosamente', receta: nuevaReceta });
    } catch (error) {
        console.error('Error al crear receta:', error);
        res.status(500).json({ success: false, message: 'Error al crear la receta', error: error.message });
    }
});

app.get('/find-user-data', async (req, res) => {
    try {
        const { nombre, apellidoP, apellidoM } = req.query;
        const content = await fs.readFile(`${SHARED_DIR}/users.txt`, 'utf8');
        const { users } = JSON.parse(content);
        const user = users.find(usuario => 
            usuario.Nombre === nombre 
            && usuario.ApellidoP === apellidoP 
            && usuario.ApellidoM === apellidoM
        );
        
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ message: 'Usuario no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/login', async (req, res) => {
    try {
        const { Email, password } = req.query;
        const content = await fs.readFile(`${SHARED_DIR}/users.txt`, 'utf8');
        const { users } = JSON.parse(content);
        // Buscar al usuario por Email
        const user = users.find(usuario => 
            usuario.Email === Email &&
            usuario.Estado === 1
        );
        // console.log(user);
        if (user) { 
            const isPasswordValid = await bcrypt.compare(password, user.Contrasena);
            if (isPasswordValid) {
                const token = jwt.sign(
                    { userId: user.ID_User, email: user.Email },
                    SECRET_KEY
                );

                res.json({user, message: "ACC", token});
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

app.post('/update-password', async (req, res) => {
    try {
        const { nombre, apellidoP, apellidoM, newPassword } = req.body;
        console.log(nombre, apellidoP, apellidoM, newPassword);
        const content = await fs.readFile(`${SHARED_DIR}/users.txt`, 'utf8');
        const { users } = JSON.parse(content);
        
        const userIndex = users.findIndex(usuario => 
            usuario.Nombre === nombre 
            && usuario.ApellidoP === apellidoP 
            && usuario.ApellidoM === apellidoM
        );
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        datos[userIndex].Contrasena = hashedPassword;
        console.log(datos);
        await fs.writeFile(`${SHARED_DIR}/users.txt`, JSON.stringify({ datos }, null, 2), 'utf8');
        
        res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/checkEmail', async (req, res) => {
    try {
        const { email } = req.body;
        try {
            const filePath = `${SHARED_DIR}/users.txt`;
            const fileContent = await fs.readFile(filePath, 'utf8');
            const { users } = JSON.parse(fileContent);
            const user = users.find(usuario => 
                usuario.Email === email
            );
            if (user) {
                // console.log(`Correo ${email} en uso`);
                return res.status(200).json({ available: "1" });
            }
            // console.log(`Correo ${email} libre`);
            return res.status(200).json({ available: "2" });
        } catch (fileError) {
            if (fileError.code !== 'ENOENT') {
                throw fileError;
            }
            return res.status(200).json({ available: true });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Ruta para manejar el registro de usuarios
app.post('/register-user', async (req, res) => {
    const filePath = `${SHARED_DIR}/users.txt`;
    const filePathFoodRev  = `${SHARED_DIR}/food_rev.txt`;
    const filePathChefs = `${SHARED_DIR}/chefs.txt`;
    try {
        // Función para leer o crear el archivo si no existe
        const readOrCreateFile = async (filePath, defaultData) => {
            try {
                const fileContent = await fs.readFile(filePath, 'utf8');
                return JSON.parse(fileContent);
            } catch (fileError) {
                if (fileError.code === 'ENOENT') {
                    // Si el archivo no existe, crear el archivo con los datos predeterminados
                    await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
                    return defaultData; // Retorna los datos predeterminados
                }
                throw fileError;  // Si ocurre otro error, lanzarlo
            }
        };

        try {
            usersData = await readOrCreateFile(filePath, { users: [] });
            food_revData = await readOrCreateFile(filePathFoodRev, { food_rev: [] });
            chefsData = await readOrCreateFile(filePathChefs, { chefs: [] });
        } catch (error) {
            console.error("Error al leer o crear los archivos:", error);
        }

        // Obtener los datos del formulario enviados
        const { nombre, apellidoP, apellidoM, email, telefono, contrasena, tipoUsuario, biografia, specialties, certifications, studies } = req.body;

        // Generar el ID del usuario
        const newId = usersData.users.length > 0 
        ? 'USR' + String(Math.max(...usersData.users.map(user => parseInt(user.ID_User.slice(3)))) + 1).padStart(5, '0') 
        : 'USR00001';

        const newIdFR = food_revData.food_rev.length > 0 
        ? 'FRV' + String(Math.max(...food_revData.food_rev.map(food_rev => parseInt(food_rev.ID_Critico.slice(3)))) + 1).padStart(5, '0') 
        : 'FRV00001';

        const newIdCH = chefsData.chefs.length > 0 
        ? 'CHF' + String(Math.max(...chefsData.chefs.map(chef => parseInt(chef.ID_Chef.slice(3)))) + 1).padStart(5, '0') 
        : 'CHF00001';

        // Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(contrasena, 10);

        // Determinar el tipo de usuario
        let tipoUsuarioFinal = '';
        if (tipoUsuario === "chefPro") {
            tipoUsuarioFinal = "Chef Profesional";
            // console.log(`Chef Profesional:\n${specialties}\n${certifications}`);
            const newChef = {
                ID_Chef: newIdCH,
                ID_User: newId,
                TipoChef: tipoUsuarioFinal, 
                Especialidades: specialties,
                Certificaciones: certifications,
                RatingPromedio: 0.0,
                Seguidores: []
            };
            chefsData.chefs.push(newChef);
            await fs.writeFile(filePathChefs, JSON.stringify(chefsData, null, 2), 'utf8');
        } else if (tipoUsuario === "chefAf") {
            tipoUsuarioFinal = "Chef Aficionado";
            // console.log(`Chef Aficionado:\n${specialties}\n${certifications}`);
            const newChef = {
                ID_Chef: newIdCH,
                ID_User: newId,
                TipoChef: tipoUsuarioFinal, 
                Especialidades: specialties,
                Certificaciones: certifications,
                RatingPromedio: 0.0,
                Seguidores: []
            };
            chefsData.chefs.push(newChef);
            await fs.writeFile(filePathChefs, JSON.stringify(chefsData, null, 2), 'utf8');
        } else if (tipoUsuario === "critico") {
            tipoUsuarioFinal = "Critico";
            const newFood_rev = {
                ID_Critico: newIdFR,
                ID_User: newId,
                TipoCritico: tipoUsuarioFinal,
                Estudios: studies,
                Seguidos: []
            };

            food_revData.food_rev.push(newFood_rev);
            await fs.writeFile(filePathFoodRev, JSON.stringify(food_revData, null, 2), 'utf8');
        } else {
            tipoUsuarioFinal = "Consumidor";
            const newFood_rev = {
                ID_Critico: newIdFR,
                ID_User: newId,
                TipoCritico: tipoUsuarioFinal,
                Estudios: [],
                Seguidos: []
            };

            food_revData.food_rev.push(newFood_rev);
            await fs.writeFile(filePathFoodRev, JSON.stringify(food_revData, null, 2), 'utf8');
        }

        // Crear el nuevo usuario
        const newUser = {
            ID_User: newId,
            Nombre: nombre,
            ApellidoP: apellidoP,
            ApellidoM: apellidoM,
            Email: email,
            Telefono: telefono,
            Contrasena: hashedPassword,
            imagen: 'user.png',
            Biografia: biografia,
            RedesSociales: [], // Opcional, agregar datos si se tienen
            TipoUsuario: tipoUsuarioFinal,
            Estado: 1
        };
        //console.log(`Nuevo usuario:\n ${JSON.stringify(newUser, null, 2)} \nAgregado con éxito.`);
        // Agregar el nuevo usuario a la lista
        usersData.users.push(newUser);
        // Guardar los cambios en el archivo
        await fs.writeFile(filePath, JSON.stringify(usersData, null, 2), 'utf8');
        // Enviar la respuesta
        res.status(201).json({ message: 'Usuario registrado exitosamente', user: newUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/find-chef-by-user-id', async(req, res) => {
    try{
        const { userId } = req.body;
        const filePath = `${SHARED_DIR}/users.txt`;
            const fileContent = await fs.readFile(filePath, 'utf8');
            const { users } = JSON.parse(fileContent);
            const user = users.find(usuario => 
                usuario.ID_User === userId
            );
            if (user) {
                if(user.TipoUsuario === "Chef Profesional" || user.TipoUsuario === "Chef Aficionado") {
                    const fileChef = `${SHARED_DIR}/chefs.txt`;
                    const content = await fs.readFile(fileChef, 'utf8');
                    const { chefs } = JSON.parse(content);
                    const chef = chefs.find(chef_ => 
                        chef_.ID_User === userId
                    );
                    if (chef) {
                        const fileReceta = `${SHARED_DIR}/recetas.txt`;
                        const recetasContent = await fs.readFile(fileReceta, 'utf8');
                        const { recetas } = JSON.parse(recetasContent);
                        const recetasChef = recetas.filter(receta_ => receta_.ID_Chef === chef.ID_Chef);
                        return res.status(200).json({ user, chef, recetas: recetasChef, available: "1" });
                    }
                }
            }
    }catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/find-user-by-id', async (req,res) => {
    try {
        const { userId } = req.body;
        try {
            const filePath = `${SHARED_DIR}/users.txt`;
            const fileContent = await fs.readFile(filePath, 'utf8');
            const { users } = JSON.parse(fileContent);
            const user = users.find(usuario => 
                usuario.ID_User === userId
            );
            if (user) {
                user.imagen = `/img/userIcons/${user.imagen}`;
                // console.log(user.TipoUsuario);
                if(user.TipoUsuario === "Chef Profesional" || user.TipoUsuario === "Chef Aficionado") {
                    const fileChef = `${SHARED_DIR}/chefs.txt`;
                    const content = await fs.readFile(fileChef, 'utf8');
                    const { chefs } = JSON.parse(content);
                    const chef = chefs.find(chef_ => 
                        chef_.ID_User === userId
                    );
                    if (chef) {
                        const fileReceta = `${SHARED_DIR}/recetas.txt`;
                        const recetasContent = await fs.readFile(fileReceta, 'utf8');
                        const { recetas } = JSON.parse(recetasContent);
                        const recetasChef = recetas.filter(receta_ => receta_.ID_Chef === chef.ID_Chef);
                        // console.log(chef+"\n"+recetasChef);
                        return res.status(200).json({ user, chef, recetas: recetasChef, available: "1" });
                    }
                }else if (user.TipoUsuario === "Critico" || user.TipoUsuario === "Consumidor") {
                    // console.log(user.TipoUsuario);
                    const fileFR = `${SHARED_DIR}/food_rev.txt`;
                    const contentfr = await fs.readFile(fileFR, 'utf8');
                    const { food_rev } = JSON.parse(contentfr);
                    const foodr = food_rev.find(foodr_ => 
                        foodr_.ID_User === userId
                    );
                    if (foodr) {
                        // console.log(foodr);
                        return res.status(200).json({user, foodr, available: "1" });
                    }
                }
                //return res.status(200).json({user, available: "1" });
            }
            // Usuario no encontrado
            return res.status(200).json({ available: "2" });
        } catch (fileError) {
            if (fileError.code !== 'ENOENT') {
                throw fileError;
            }
            return res.status(200).json({ available: false });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/read-anuncios', async (req, res) => {
    try {
        // Crear una ruta absoluta para el archivo
        const anunciosFilePath = path.join(SHARED_DIR, 'anuncios.txt');
        
        // Leer el contenido del archivo
        const content = await fs.readFile(anunciosFilePath, 'utf8');
        const { anuncios } = JSON.parse(content);
        
        // Generar URLs completas para las imágenes
        const anunciosConUrls = anuncios.map(anuncio => ({
            ...anuncio,
            ImagenPerfil: `http://25.61.139.76:3000/img/anuncios/${anuncio.ImagenPerfil}`, // Generar URL completa
            Imagenes: anuncio.Imagenes.map(img => `http://25.61.139.76:3000/img/anuncios/${img}`)
        }));
        
        res.json({ anuncios: anunciosConUrls });
    } catch (error) {
        console.error('Error al leer el archivo:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/read-recetas', async (req, res) => {
    try {
        const recetasFilePath = path.join(SHARED_DIR, 'recetas.txt');
        const content = await fs.readFile(recetasFilePath, 'utf8');
        const { recetas } = JSON.parse(content);

        // Generar URLs completas para las imágenes
        const recetasConUrls = recetas.map(receta => ({
            ...receta,
            Imagenes: receta.Imagenes.map(img => `http://25.61.139.76:3000/img/recetas/${img}`)
        }));

        res.json({ recetas: recetasConUrls });
    } catch (error) {
        console.error('Error al leer el archivo:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para leer el archivo "chefs.txt"
app.get('/read-chefs', async (req, res) => {
    try {
      // Ruta del archivo chefs.txt
      const chefsFilePath = path.join(SHARED_DIR, 'chefs.txt'); // Asegúrate de que el archivo está en esta ruta
      const content = await fs.readFile(chefsFilePath, 'utf8');
  
      // Convertir el contenido del archivo a JSON
      const chefsData = JSON.parse(content);
  
      res.json({ chefs: chefsData.chefs });
    } catch (error) {
      console.error('Error al leer el archivo de chefs:', error.message);
      res.status(500).json({ error: 'No se pudo leer el archivo de chefs.' });
    }
});

app.post('/update-user', (req, res, next) => {
    const uploadMiddleware = upload.single('imagen'); // Middleware de Multer

    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('Error al procesar el archivo:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { email, nombre, apellidoP, apellidoM, telefono, biografia } = req.body;
        //console.log(email);
        if (!email) {
            return res.status(400).json({ success: false, message: 'El campo email es obligatorio.' });
        }

        // Leer el archivo y buscar al usuario
        const filePath = `${SHARED_DIR}/users.txt`;
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        const userIndex = data.users.findIndex((u) => u.Email === email);

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        const userId = data.users[userIndex].ID_User;

        // Actualizar datos del usuario
        data.users[userIndex].Nombre = nombre;
        data.users[userIndex].ApellidoP = apellidoP;
        data.users[userIndex].ApellidoM = apellidoM;
        data.users[userIndex].Telefono = telefono;
        data.users[userIndex].Biografia = biografia;

        // Manejar la imagen si existe
        if (req.file) {
            const extension = path.extname(req.file.originalname);
            data.users[userIndex].imagen = `${userId}${extension}`;
        }

        // Guardar los cambios
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

        // Devolver los datos actualizados
        const updatedUser = data.users[userIndex];
        res.json({ success: true, message: 'Usuario actualizado correctamente', user: updatedUser });
    } catch (error) {
        console.error('Error al actualizar el usuario:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/deactivate-account', async (req, res) => {
    try {
        const { userId } = req.body;

        // Verificar si se envió el userId
        if (!userId) {
            return res.status(400).json({ success: false, message: 'El ID del usuario no fue proporcionado.' });
        }

        const filePath = `${SHARED_DIR}/users.txt`;

        // Leer el archivo users.txt
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);

        // Buscar al usuario por ID
        const userIndex = data.users.findIndex(user => user.ID_User === userId);

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado en el archivo.' });
        }

        // Cambiar el campo Estado a 0
        data.users[userIndex].Estado = 0;

        // Guardar los cambios
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

        res.json({ success: true, message: 'Cuenta desactivada con éxito.' });
    } catch (error) {
        console.error('Error al desactivar la cuenta:', error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor al desactivar la cuenta.' });
    }
});

//api de los mapas
const MAPBOX_API_KEY = 'pk.eyJ1IjoiZ2lnaTIwMDIiLCJhIjoiY200bm10empmMGFlMTJscTFzcTQ4MDNpYyJ9.V9BU5CSChAzYoTC-0Mta9Q';

//envia el token al front
app.get('/mapbox-token', (req, res) => {
    res.json({ token: MAPBOX_API_KEY });
});
//datos de restautantes
app.get('/restaurant/:id', (req, res) => {
    const restaurants = [
        { id: 1, name: 'Restaurante 1', lat: 41.387, lng: 2.153 },
         { id: 2, name: 'Restaurante 2', lat: 19.432600765200366, lng: -99.19491346445292 },
         { id: 3, name: 'Restaurante 3', lat: 48.8490531248463, lng: 2.375918347698081 },
         { id: 4, name: 'Restaurante 4', lat: 40.744410497932925, lng: -73.9828180169047 },
         { id: 5, name: 'Restaurante 5', lat: 13.740992322103363, lng: 100.56760815346942 },
    ];

    const restaurant = restaurants.find(r => r.id === parseInt(req.params.id));
    if (restaurant) {
        res.json(restaurant);
    } else {
        res.status(404).json({ error: 'Restaurante no encontrado' });
    }
});

app.get('/read-food-critics', async (req, res) => {
    try {
        // Ruta del archivo de críticos (asumiendo que se llama food_rev.txt o similar)
        const criticsFilePath = path.join(SHARED_DIR, 'food_rev.txt');
        
        // Leer el contenido del archivo
        const content = await fs.readFile(criticsFilePath, 'utf8');
        
        // Convertir el contenido del archivo a JSON
        const criticsData = JSON.parse(content);
        
        // Devolver los críticos
        res.json({ food_rev: criticsData.food_rev });
    } catch (error) {
        console.error('Error al leer el archivo de críticos:', error.message);
        res.status(500).json({ error: 'No se pudo leer el archivo de críticos.' });
    }
});

app.get('/ingredient-nutrition', async (req, res) => {
    const { id_receta } = req.query;

    if (!id_receta) {
        return res.status(400).json({ error: 'Se requiere el parámetro id_receta' });
    }

    try {
        // Leer archivo de recetas
        const filePath = path.join(SHARED_DIR, 'recetas.txt');
        const fileData = await fs.readFile(filePath, 'utf8');
        const recetas = JSON.parse(fileData).recetas;

        // Buscar receta por ID
        const receta = recetas.find(r => r.ID_Receta === id_receta);

        if (!receta) {
            return res.status(404).json({ error: `No se encontró la receta con ID: ${id_receta}` });
        }

        // Obtener ingredientes
        const ingredientes = Object.keys(receta.Ingredientes);

        const infoNutricional = [];

        for (const ingrediente of ingredientes) {
            try {
                // Buscar ingrediente en la API
                const searchResponse = await axios.get('https://api.spoonacular.com/food/ingredients/search', {
                    params: {
                        apiKey: SPOONACULAR_API_KEY,
                        query: ingrediente,
                        number: 1,
                    },
                });

                if (searchResponse.data.results.length === 0) {
                    infoNutricional.push({
                        nombre: ingrediente,
                        error: 'Ingrediente no encontrado',
                    });
                    continue;
                }

                const ingredientId = searchResponse.data.results[0].id;

                // Obtener información nutricional
                const nutritionResponse = await axios.get(`https://api.spoonacular.com/food/ingredients/${ingredientId}/information`, {
                    params: {
                        apiKey: SPOONACULAR_API_KEY,
                        amount: 100,
                        unit: 'grams',
                    },
                });

                // Extraer datos relevantes
                const nutricionDetallada = {
                    nombre: nutritionResponse.data.originalName || 'Nombre no disponible',
                    calorias: nutritionResponse.data.nutrition.nutrients.find(n => n.name === 'Calories').amount || 0,
                    proteinas: nutritionResponse.data.nutrition.nutrients.find(n => n.name === 'Protein').amount || 0,
                    carbohidratos: nutritionResponse.data.nutrition.nutrients.find(n => n.name === 'Carbohydrates').amount || 0,
                    grasas: nutritionResponse.data.nutrition.nutrients.find(n => n.name === 'Fat').amount || 0,
                    nutrientesPrincipales: {
                        calcio: nutritionResponse.data.nutrition.nutrients.find(n => n.name === 'Calcium').amount || 0,
                        hierro: nutritionResponse.data.nutrition.nutrients.find(n => n.name === 'Iron').amount || 0,
                        vitaminas: nutritionResponse.data.nutrition.nutrients
                            .filter(n => n.name.includes('Vitamin'))
                            .map(v => ({
                                nombre: v.name,
                                cantidad: v.amount,
                            })),
                    },
                };

                infoNutricional.push(nutricionDetallada);
            } catch (error) {
                console.error(`Error con el ingrediente ${ingrediente}:`, error.message);
                infoNutricional.push({
                    nombre: ingrediente,
                    error: 'No se pudo obtener información nutricional',
                });
            }
        }

        res.json(infoNutricional);
    } catch (error) {
        console.error('Error general:', error);
        res.status(500).json({ error: 'Error al obtener información nutricional' });
    }
});

app.post('/add-interaction', async (req, res) => {
    try {
        // Extraer datos del cuerpo de la solicitud
        const { tipoInteraccion, idReceta, idUsuario, fechaInteraccion } = req.body;

        // Validar que todos los campos obligatorios estén presentes
        if (!tipoInteraccion || !idReceta || !idUsuario || !fechaInteraccion) {
            return res.status(400).json({ 
                mensaje: 'Faltan datos obligatorios para la interacción.' 
            });
        }

        // Ruta del archivo de recetas
        const recetasFilePath = path.join(SHARED_DIR, 'recetas.txt');

        // Leer y actualizar archivo de recetas
        const recetasContent = await fs.readFile(recetasFilePath, 'utf8');
        const recetasData = JSON.parse(recetasContent);
        
        // Encontrar la receta por ID
        const recetaIndex = recetasData.recetas.findIndex(receta => receta.ID_Receta === idReceta);
        
        if (recetaIndex !== -1) {
            // Preparar objeto de interacción
            const nuevaInteraccion = {
                ID_User: idUsuario,
                Tipo_Interaccion: tipoInteraccion,
                Fecha_Interaccion: new Date().toISOString() // Formato ISO 8601
            };

            // Agregar interacción a la receta si no existe
            if (!recetasData.recetas[recetaIndex].Interacciones) {
                recetasData.recetas[recetaIndex].Interacciones = [];
            }

            const interacciones = recetasData.recetas[recetaIndex].Interacciones;

            // Verificar y eliminar interacciones conflictivas
            const conflictiva = tipoInteraccion === 'Me gusta' ? 'No me gusta' : 
                                tipoInteraccion === 'No me gusta' ? 'Me gusta' : null;

            if (conflictiva) {
                recetasData.recetas[recetaIndex].Interacciones = interacciones.filter(
                    interaccion => !(interaccion.ID_User === idUsuario && interaccion.Tipo_Interaccion === conflictiva)
                );
            }

            // Verificar si ya existe una interacción del mismo tipo para este usuario
            const interaccionExistente = interacciones.some(
                interaccion => 
                    interaccion.ID_User === idUsuario && 
                    interaccion.Tipo_Interaccion === tipoInteraccion
            );

            if (interaccionExistente) {
                return res.status(400).json({ 
                    mensaje: 'Ya existe esta interacción para este usuario y receta' 
                });
            }
            
            // Agregar nueva interacción
            recetasData.recetas[recetaIndex].Interacciones.push(nuevaInteraccion);
            
            // Guardar cambios en el archivo de recetas
            await fs.writeFile(recetasFilePath, JSON.stringify(recetasData, null, 2));

            // Responder con éxito
            res.status(201).json({ 
                mensaje: 'Interacción agregada exitosamente'
            });
        } else {
            res.status(404).json({ 
                mensaje: 'Receta no encontrada' 
            });
        }

    } catch (error) {
        // Manejo de errores
        console.error('Error al procesar la interacción:', error);
        res.status(500).json({ 
            mensaje: 'Error interno del servidor al procesar la interacción',
            error: error.message 
        });
    }
});

app.post('/add-rating', async (req, res) => {
    try {
        // Extraer datos del cuerpo de la solicitud
        let { idReceta, idUsuario, calificacion } = req.body;
        console.log(idReceta, idUsuario, calificacion);

        // Convertir calificacion a número
        calificacion = Number(calificacion);

        // Validar que todos los campos obligatorios estén presentes
        if (!idReceta || !idUsuario || isNaN(calificacion)) {
            return res.status(400).json({
                mensaje: 'Faltan datos obligatorios para la calificación o la calificación no es válida.'
            });
        }

        // Ruta del archivo de recetas
        const recetasFilePath = path.join(SHARED_DIR, 'recetas.txt');
        // Ruta del archivo de usuarios
        const usersFilePath = path.join(SHARED_DIR, 'users.txt');

        // Leer y actualizar archivo de recetas
        const recetasContent = await fs.readFile(recetasFilePath, 'utf8');
        const recetasData = JSON.parse(recetasContent);

        // Leer archivo de usuarios para obtener el tipo de usuario
        const usersContent = await fs.readFile(usersFilePath, 'utf8');
        const usersData = JSON.parse(usersContent);

        // Buscar el usuario por su ID
        const usuario = usersData.users.find(user => user.ID_User === idUsuario);

        if (!usuario) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado.'
            });
        }

        // Si el usuario es "Crítico", multiplicamos la calificación por 1.2
        if (usuario.TipoUsuario === 'Critico') {
            calificacion = calificacion * 1.2;
            console.log(`La calificación ha sido ajustada para el usuario Crítico ${idUsuario}: ${calificacion}`);
        } else {
            console.log(`Calificación de usuario ${idUsuario} no ajustada (TipoUsuario: ${usuario.TipoUsuario})`);
        }

        // Encontrar la receta por ID
        const recetaIndex = recetasData.recetas.findIndex(receta => receta.ID_Receta === idReceta);

        if (recetaIndex !== -1) {
            // Obtener la lista de calificaciones de la receta
            const calificaciones = recetasData.recetas[recetaIndex].Rating || [];

            // Buscar si ya existe una calificación de este usuario para esta receta
            const calificacionExistente = calificaciones.find(rating => rating.ID_User === idUsuario);

            if (calificacionExistente) {
                // Si ya existe una calificación, la actualizamos
                calificacionExistente.Calificacion = calificacion;
                console.log(`Calificación de usuario ${idUsuario} actualizada a ${calificacion}`);
            } else {
                // Si no existe, agregamos una nueva calificación
                const nuevaCalificacion = {
                    ID_User: idUsuario,
                    Calificacion: calificacion
                };
                calificaciones.push(nuevaCalificacion);
                console.log(`Nueva calificación de usuario ${idUsuario}: ${calificacion}`);
            }

            // Guardar cambios en el archivo de recetas
            recetasData.recetas[recetaIndex].Rating = calificaciones;
            await fs.writeFile(recetasFilePath, JSON.stringify(recetasData, null, 2));

            // Responder con éxito
            res.status(200).json({
                mensaje: 'Calificación agregada o actualizada exitosamente.'
            });
        } else {
            res.status(404).json({
                mensaje: 'Receta no encontrada.'
            });
        }

    } catch (error) {
        // Manejo de errores
        console.error('Error al procesar la calificación:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor al procesar la calificación',
            error: error.message
        });
    }
});

app.get('/top-3-recetas', async (req, res) => {
    try {
        // Ruta del archivo de recetas
        const recetasFilePath = path.join(SHARED_DIR, 'recetas.txt');
        
        // Leer el archivo de recetas
        const recetasContent = await fs.readFile(recetasFilePath, 'utf8');
        const recetasData = JSON.parse(recetasContent);

        // Crear un array para almacenar las recetas con su promedio de calificación
        const recetasConPromedio = recetasData.recetas.map(receta => {
            const calificaciones = receta.Rating || [];
            const imgReceta = receta.Imagenes[0];
            // Si no hay calificaciones, no calculamos el promedio
            if (calificaciones.length === 0) {
                return {
                    ID_Receta: receta.ID_Receta,
                    Nombre: receta.Titulo_Receta,
                    PromedioCalificacion: 0,
                    Imagen: imgReceta || '../images/placeholder.jpg'
                };
            }

            // Calcular el promedio de calificaciones
            const sumaCalificaciones = calificaciones.reduce((acc, rating) => acc + rating.Calificacion, 0);
            const promedioCalificacion = sumaCalificaciones / calificaciones.length;

            return {
                ID_Receta: receta.ID_Receta,
                Nombre: receta.Titulo_Receta,
                PromedioCalificacion: promedioCalificacion,
                Imagen: imgReceta  || '../images/placeholder.jpg'
            };
        });

        // Ordenar las recetas por promedio de calificación de mayor a menor
        const recetasOrdenadas = recetasConPromedio.sort((a, b) => 
            b.PromedioCalificacion - a.PromedioCalificacion
        );

        // Tomar las 3 mejores recetas
        const top3Recetas = recetasOrdenadas.slice(0, 3).map(receta => ({
            ID_Receta: receta.ID_Receta,
            Nombre: receta.Nombre,
            Imagen: receta.Imagen,
            PromedioCalificacion: receta.PromedioCalificacion
        }));
        //console.log(top3Recetas);
        // Responder con las 3 mejores recetas
        res.status(200).json({
            top3Recetas
        });

    } catch (error) {
        // Manejo de errores
        console.error('Error al calcular las 3 mejores recetas:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor al calcular las mejores recetas',
            error: error.message
        });
    }
});

app.get('/chef/:id', async (req, res) => {
    try {
        // Extraer el ID del chef de los parámetros de la ruta
        const chefId = req.params.id;
        
        // Rutas de los archivos
        const chefsFilePath = path.join(SHARED_DIR, 'chefs.txt');
        const usersFilePath = path.join(SHARED_DIR, 'users.txt');
        const recetasFilePath = path.join(SHARED_DIR, 'recetas.txt');
        
        // Leer archivos de chefs, usuarios y recetas
        const chefsContent = await fs.readFile(chefsFilePath, 'utf8');
        const usersContent = await fs.readFile(usersFilePath, 'utf8');
        const recetasContent = await fs.readFile(recetasFilePath, 'utf8');
        
        // Parsear los contenidos JSON
        const chefsData = JSON.parse(chefsContent);
        const usersData = JSON.parse(usersContent);
        const recetasData = JSON.parse(recetasContent);
        
        // Buscar el chef por ID
        const chef = chefsData.chefs.find(c => c.ID_User === chefId);
        if (!chef) {
            return res.status(404).json({
                mensaje: 'Chef no encontrado.'
            });
        }
        
        // Buscar el usuario del chef
        const usuario = usersData.users.find(u => u.ID_User === chef.ID_User);
        if (!usuario) {
            return res.status(404).json({
                mensaje: 'Usuario del chef no encontrado.'
            });
        }
        
        // Buscar las recetas del chef
        const recetasDelChef = recetasData.recetas.filter(r => r.ID_Chef === chef.ID_Chef);
        
        // Responder con la información separada
        res.status(200).json({
            chef: chef,
            usuario: usuario,
            recetas: recetasDelChef
        });
    } catch (error) {
        // Manejo de errores
        console.error('Error al buscar el chef:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor al buscar el chef',
            error: error.message
        });
    }
});

app.post('/seguir-usuario', async (req, res) => {
    try {
        const { user, chef } = req.body;
        //console.log(user, chef);

        // Rutas de los archivos
        const foodRevFilePath = path.join(SHARED_DIR, 'food_rev.txt');
        const chefsFilePath = path.join(SHARED_DIR, 'chefs.txt');

        // Leer archivos
        const foodRevContent = await fs.readFile(foodRevFilePath, 'utf8');
        const chefsContent = await fs.readFile(chefsFilePath, 'utf8');

        // Parsear los contenidos JSON
        let foodRevData = JSON.parse(foodRevContent);
        let chefsData = JSON.parse(chefsContent);

        // Buscar el crítico en food_rev.txt
        const criticIndex = foodRevData.food_rev.findIndex(fr => fr.ID_User === user);

        if (criticIndex === -1) {
            return res.status(404).json({ mensaje: 'Crítico no encontrado' });
        }

        // Comprobar que el usuario no se sigue a sí mismo
        if (user === chef) {
            return res.status(400).json({ mensaje: 'No puedes seguirte a ti mismo' });
        }

        // Inicializar Seguidos si no existe
        if (!foodRevData.food_rev[criticIndex].Seguidos) {
            foodRevData.food_rev[criticIndex].Seguidos = [];
        }

        // Verificar si el chef ya está en Seguidos
        const yaEstaSeguido = foodRevData.food_rev[criticIndex].Seguidos.some(
            seguido => seguido === chef
        );

        if (!yaEstaSeguido) {
            foodRevData.food_rev[criticIndex].Seguidos.push(chef);
        }

        // Buscar el chef en chefs.txt
        const chefIndex = chefsData.chefs.findIndex(c => c.ID_User === chef);

        if (chefIndex === -1) {
            return res.status(404).json({ mensaje: 'Chef no encontrado' });
        }

        // Inicializar Seguidores si no existe
        if (!chefsData.chefs[chefIndex].Seguidores) {
            chefsData.chefs[chefIndex].Seguidores = [];
        }

        // Verificar si el usuario ya está en Seguidores
        const yaEsSeguidor = chefsData.chefs[chefIndex].Seguidores.some(
            seguidor => seguidor === user
        );

        if (!yaEsSeguidor) {
            chefsData.chefs[chefIndex].Seguidores.push(user);
        }

        // Guardar los cambios en los archivos
        await fs.writeFile(foodRevFilePath, JSON.stringify(foodRevData, null, 2));
        await fs.writeFile(chefsFilePath, JSON.stringify(chefsData, null, 2));

        res.status(200).json({
            mensaje: 'Seguimiento exitoso',
            foodRev: foodRevData.food_rev[criticIndex],
            chef: chefsData.chefs[chefIndex]
        });

    } catch (error) {
        console.error('Error al seguir usuario:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor',
            error: error.message
        });
    }
});

app.post('/seguir-chef', async (req, res) => {
    try {
        const { user: chef1, chef: chef2 } = req.body;
        //console.log('Chef 1:', chef1, 'Chef 2:', chef2);

        // Rutas de los archivos
        const chefsFilePath = path.join(SHARED_DIR, 'chefs.txt');

        // Leer archivo de chefs
        const chefsContent = await fs.readFile(chefsFilePath, 'utf8');
        let chefsData = JSON.parse(chefsContent);

        // Buscar chef 1 (quien sigue)
        const chef1Index = chefsData.chefs.findIndex(c => c.ID_User === chef1);
        if (chef1Index === -1) {
            return res.status(404).json({ mensaje: 'Chef 1 no encontrado' });
        }

        // Buscar chef 2 (a quien se sigue)
        const chef2Index = chefsData.chefs.findIndex(c => c.ID_User === chef2);
        if (chef2Index === -1) {
            return res.status(404).json({ mensaje: 'Chef 2 no encontrado' });
        }

        // Evitar seguirse a sí mismo
        if (chef1 === chef2) {
            return res.status(400).json({ mensaje: 'Un chef no puede seguirse a sí mismo' });
        }

        // Inicializar Seguidos si no existe para chef 1
        if (!chefsData.chefs[chef1Index].Seguidos) {
            chefsData.chefs[chef1Index].Seguidos = [];
        }

        // Verificar si chef 2 ya está en Seguidos de chef 1
        const yaEstaSeguido = chefsData.chefs[chef1Index].Seguidos.some(
            seguido => seguido === chef2
        );

        if (!yaEstaSeguido) {
            chefsData.chefs[chef1Index].Seguidos.push(chef2);
        }

        // Inicializar Seguidores si no existe para chef 2
        if (!chefsData.chefs[chef2Index].Seguidores) {
            chefsData.chefs[chef2Index].Seguidores = [];
        }

        // Verificar si chef 1 ya está en Seguidores de chef 2
        const yaEsSeguidor = chefsData.chefs[chef2Index].Seguidores.some(
            seguidor => seguidor === chef1
        );

        if (!yaEsSeguidor) {
            chefsData.chefs[chef2Index].Seguidores.push(chef1);
        }

        // Guardar los cambios en el archivo
        await fs.writeFile(chefsFilePath, JSON.stringify(chefsData, null, 2));

        res.status(200).json({
            mensaje: 'Seguimiento de chef exitoso',
            chef1: chefsData.chefs[chef1Index],
            chef2: chefsData.chefs[chef2Index]
        });

    } catch (error) {
        console.error('Error al seguir chef:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor',
            error: error.message
        });
    }
});

app.post('/dejar-seguir-usuario', async (req, res) => {
    try {
        const { user, chef } = req.body;
        // console.log('Dejando de seguir:', user, chef);

        // Rutas de los archivos
        const foodRevFilePath = path.join(SHARED_DIR, 'food_rev.txt');
        const chefsFilePath = path.join(SHARED_DIR, 'chefs.txt');

        // Leer archivos
        const foodRevContent = await fs.readFile(foodRevFilePath, 'utf8');
        const chefsContent = await fs.readFile(chefsFilePath, 'utf8');

        // Parsear los contenidos JSON
        let foodRevData = JSON.parse(foodRevContent);
        let chefsData = JSON.parse(chefsContent);

        // Buscar el crítico en food_rev.txt
        const criticIndex = foodRevData.food_rev.findIndex(fr => fr.ID_User === user);

        if (criticIndex === -1) {
            return res.status(404).json({ mensaje: 'Crítico no encontrado' });
        }

        // Comprobar que el usuario no intenta dejar de seguirse a sí mismo
        if (user === chef) {
            return res.status(400).json({ mensaje: 'Operación inválida' });
        }

        // Verificar y eliminar de Seguidos del crítico
        if (foodRevData.food_rev[criticIndex].Seguidos) {
            foodRevData.food_rev[criticIndex].Seguidos = foodRevData.food_rev[criticIndex].Seguidos.filter(
                seguido => seguido !== chef
            );
        }

        // Buscar el chef en chefs.txt
        const chefIndex = chefsData.chefs.findIndex(c => c.ID_User === chef);

        if (chefIndex === -1) {
            return res.status(404).json({ mensaje: 'Chef no encontrado' });
        }

        // Verificar y eliminar de Seguidores del chef
        if (chefsData.chefs[chefIndex].Seguidores) {
            chefsData.chefs[chefIndex].Seguidores = chefsData.chefs[chefIndex].Seguidores.filter(
                seguidor => seguidor !== user
            );
        }

        // Guardar los cambios en los archivos
        await fs.writeFile(foodRevFilePath, JSON.stringify(foodRevData, null, 2));
        await fs.writeFile(chefsFilePath, JSON.stringify(chefsData, null, 2));

        res.status(200).json({
            mensaje: 'Dejar de seguir exitoso',
            foodRev: foodRevData.food_rev[criticIndex],
            chef: chefsData.chefs[chefIndex]
        });

    } catch (error) {
        console.error('Error al dejar de seguir usuario:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor',
            error: error.message
        });
    }
});

app.post('/dejar-seguir-chef', async (req, res) => {
    try {
        const { user: chef1, chef: chef2 } = req.body;
        // console.log('Dejando de seguir chef:', chef1, chef2);

        // Rutas de los archivos
        const chefsFilePath = path.join(SHARED_DIR, 'chefs.txt');

        // Leer archivo de chefs
        const chefsContent = await fs.readFile(chefsFilePath, 'utf8');
        let chefsData = JSON.parse(chefsContent);

        // Buscar chef 1 (quien deja de seguir)
        const chef1Index = chefsData.chefs.findIndex(c => c.ID_User === chef1);
        if (chef1Index === -1) {
            return res.status(404).json({ mensaje: 'Chef 1 no encontrado' });
        }

        // Buscar chef 2 (a quien se deja de seguir)
        const chef2Index = chefsData.chefs.findIndex(c => c.ID_User === chef2);
        if (chef2Index === -1) {
            return res.status(404).json({ mensaje: 'Chef 2 no encontrado' });
        }

        // Evitar intentar dejar de seguirse a sí mismo
        if (chef1 === chef2) {
            return res.status(400).json({ mensaje: 'Operación inválida' });
        }

        // Verificar y eliminar de Seguidos de chef 1
        if (chefsData.chefs[chef1Index].Seguidos) {
            chefsData.chefs[chef1Index].Seguidos = chefsData.chefs[chef1Index].Seguidos.filter(
                seguido => seguido !== chef2
            );
        }

        // Verificar y eliminar de Seguidores de chef 2
        if (chefsData.chefs[chef2Index].Seguidores) {
            chefsData.chefs[chef2Index].Seguidores = chefsData.chefs[chef2Index].Seguidores.filter(
                seguidor => seguidor !== chef1
            );
        }

        // Guardar los cambios en el archivo
        await fs.writeFile(chefsFilePath, JSON.stringify(chefsData, null, 2));

        res.status(200).json({
            mensaje: 'Dejar de seguir chef exitoso',
            chef1: chefsData.chefs[chef1Index],
            chef2: chefsData.chefs[chef2Index]
        });

    } catch (error) {
        console.error('Error al dejar de seguir chef:', error);
        res.status(500).json({
            mensaje: 'Error interno del servidor',
            error: error.message
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
	console.log('Servidor corriendo en el puerto: '+ PORT);
});
