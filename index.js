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
const Base_Url = process.env.BASE_URL;
// console.log("Base", Base_Url);
const app = express();

// As we are using credentials
app.use( cors( {
    origin: Base_Url,
    credentials: true,
}));

app.use(express.json());
// We are using cookies to get to know if user is login
// If user is logged in we will show him his profile
app.use(cookieParser());

app.use('/uploads', express.static(__dirname + '/uploads'));

app.post('/register', async (req, res) => {
    const {username, password} = req.body;
    try{
        // Create a new User
        const userDocs = await User.create( {
            username, 
            password :bcrypt.hashSync(password, salt),
        } );
        res.json( userDocs );
    } catch (error){
        res.status(400).json(error);
    }
});

app.post('/login', async (req, res) => {
    try{
        const {username, password} = req.body;
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
            jwt.sign( {username, id: userDoc._id}, secret, {}, (err, token) =>{
                // console.log("UserId Login ", userDoc._id);
                if (err) {
                    console.error('Login: Error:', err);
                    return res.status(401).json({ message: 'Login Jwt sign failed' });
                };
                res.cookie('token', token, { httpOnly: true, sameSite: 'None', secure: true }).json({
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
    const {token} = req.cookies;
    if (!token) {
        return res.status(401).json({ message: 'JWT must be provided' });
    }
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) {
            console.error('JWT Verification Error:', err);
            return res.status(401).json({ message: 'JWT verification failed' });
        };
        res.json(info);
    });
});

// Here we are updating the cookie to null
app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
});

// Route to create post
app.post('/post', uploadMiddleWare.single('file'), async (req, res) => {
    // console.log('Received token at Create Post:', req.cookies.token); // Log the token
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
        if (!token) {
            return res.status(401).json({ message: 'Create Post :JWT must be provided' });
        }
        jwt.verify(token, secret, {}, async (err, info) => {
            if (err)  {
                console.error('JWT Verification Error:', err);
                return res.status(401).json({ message: 'Post Route:JWT verification failed' });
              }
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
    // console.log('Received token at Update Post:', req.cookies.token); // Log the token

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
        // console.log('Update Token:', token); // Log the token
        if (!token) {
            return res.status(401).json({ message: 'Update Route:JWT must be provided' });
        }
        jwt.verify(token, secret, {}, async (err, info) => {
            if (err)  {
                console.error('JWT Verification Error at Update Path:', err);
                return res.status(401).json({ message: 'JWT verification failed at Update Route' });
            }
            try{
                const { id, title, summary, content } = req.body;
                const postDoc = await Post.findById(id);
                const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
                if (!isAuthor) {
                    return res.status(400).json('you are not the author');
                }

                await postDoc.updateOne({
                    title,
                    summary,
                    content,
                    cover: newPath ? newPath : postDoc.cover,
                });
              
                // res.json(postDoc);
                res.json({ message: 'Post updated successfully', post: postDoc });
            }catch (error) {
                console.error('Error:', error.message);
                res.status(500).json({ message: error.message });
            }
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