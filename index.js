require('dotenv').config()

const express  = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Schema
const User = require('./Models/User');
const Post = require('./Models/Post');

const bcrypt = require('bcryptjs');
const salt = bcrypt.genSaltSync(10);
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Multer is a node.js middleware for handling multipart/form-data, which is primarily used for uploading files.
const multer = require('multer');
const uploadMiddleWare = multer({ dest: 'uploads/' })

// To change file extension to webp (file system)
const fs = require('fs');   // fs was not working
const sharp = require('sharp');
const { log, info } = require('console');

const PORT = process.env.port || 4000;
const MONGODB_URL = process.env.mongodb_url
const secret = process.env.secret;

const app = express();

app.use(express.json());
// We are using cookies to get to know if user is login
// If user is logged in we will show him his profile
app.use(cookieParser());

app.use('/uploads', express.static(__dirname + '/uploads'));

// As we are using credentials
app.use( cors( {
    credentials: true,
    origin: 'http://localhost:3000',
}));

app.post('/register', async (req, res) => {
    const {username, password} = req.body;
    try{
        // Create a new User
        const userDocs = await User.create( 
            {username, 
            password :bcrypt.hashSync(password, salt),
        } );
        res.json( userDocs );
    } catch (error){
        res.status(400).json(error);
    }
});

app.post('/login', async (req, res) => {
    const {username, password} = req.body;
    try{
        // Create a new User
        const userDoc = await User.findOne({
            username: username,
        })

        if (!userDoc) {
            // Handle the case where the user is not found
            return res.status(400).json('User not found');
        }
        const passOk = bcrypt.compareSync(password, userDoc.password);
        // res.json( passOk );
        if (passOk){
            // console.log(passOk);
            jwt.sign( {username, id: userDoc._id}, secret, {}, (err, token) =>{
                if (err) throw err;
                res.cookie('token', token).json({
                    id: userDoc._id,
                    username,
                });
            });
        }
        else {
            res.status(400).json('wrong credentials');
        }
    } catch (error){
        res.status(400).json(error);
    }
});

// We will take the cookie and show profile
app.get('/profile', (req, res) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'JWT must be provided' });
    }
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) throw err;
        res.json(info);
    });
});

// Here we are updating the cookie to null
app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
});

// Route to create post
app.post('/post', uploadMiddleWare.single('file'), async (req, res) => {
    try {
        // const {title, summary, content} = req.body;

        // if (!req.file) {
        //     return res.status(400).json({ message: 'No file uploaded' });
        // }
        // We cant view the file bcoz it is either binary or uses an unsupported text encoding.
        // We will change it to webp
        const { originalname, path } = req.file;
        const parts = originalname.split('.');
        const ext = parts[parts.length - 1];
        const newPath = path + '.webp';

        // Use sharp to convert the image to WebP format

            sharp(path)
                .webp() // Convert to WebP format
                .toFile(newPath, async (err, info) => {
                    if (err) {
                        console.error('Error converting to WebP:', err);
                        return res.status(500).send({ message: 'Error converting image' });
                    }
                    // Remove the original image file
                    fs.unlink(path, (err) => {
                        if (err) {
                          console.error('Error file:', err);
                        } else {
                          console.log('successfully.');
                        }
                      });
                });

        const {token} = req.cookies;
        jwt.verify(token, secret, {}, async (err, info) => {
            if (err) throw err;
                const { title, summary, content } = req.body;
                // Create the Post document with the WebP path
                const postDoc = await Post.create({
                    title,
                    summary,
                    content,
                    cover: newPath,
                    author: info.id,

                });
                res.json(postDoc);
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send({ message: error.message });
    }
});

app.get('/post', async (req, res) => {
    const postsData = await Post.find()
    .populate('author', ['username'])
    .sort({createdAt: -1})
    .limit(20);

    res.json(postsData);
});

app.get('/post/:id', async (req, res) =>{
    const {id} = req.params;

    try {
        const postDoc = await Post.findById(id).populate('author', ['username']);
        res.json(postDoc);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send({ message: error.message });
    }

})

// Route to Update the data
app.put('/post', uploadMiddleWare.single('file'), async(req, res) => {
    let newPath = null;
    if(req.file){
        const { originalname, path } = req.file;
        const parts = originalname.split('.');
        const ext = parts[parts.length - 1];
        newPath = path + '.webp';
    
        // Use sharp to convert the image to WebP format

        sharp(path)
            .webp() // Convert to WebP format
            .toFile(newPath, async (err, info) => {
                if (err) {
                    console.error('Error converting to WebP:', err);
                    return res.status(500).send({ message: 'Error converting image' });
                }
                // Remove the original image file
                fs.unlinkSync(path);
            });
    }

        const {token} = req.cookies;
        jwt.verify(token, secret, {}, async (err, Info) => {
            if (err) throw err;
                const { id, title, summary, content } = req.body;
                const postDoc = await Post.findById(id);
                const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(Info.id);
                if (!isAuthor) {
                    return res.status(400).json('you are not the author');
                }

                await Post.findByIdAndUpdate(id,{
                    title,
                    summary,
                    content,
                    cover: newPath ? newPath : postDoc.cover,
                });

                 // Retrieve the updated document
                const updatedPost = await Post.findById(id);

              
                res.json(updatedPost);
        });
});

app.delete('/post/:id', async (req, res) => {
    try {
        const {id} = req.params;
        // console.log(id);
        const result = await Post.findByIdAndDelete(id);

        if( !result ) {
            return res.status(404).json( {message: 'No post found'});
        }

        return res.status(200).send( {message : 'Post deleted successfully'});

    } catch (error) {
        console.log(error);
        res.status(500).send({message : error.message})
    }
})

mongoose
    .connect(MONGODB_URL)
    .then( () => {
        console.log("App connected to database ");
        app.listen(PORT, () => {
            console.log(`App listening on port ${PORT}`);
        })
    })
    .catch( (error) => {
        console.log(error);
    })

// 