const mongoose = require('mongoose');

const UserSchema = mongoose.Schema (
    {
        username : {
            type: String,
            required: true,
            min: 2,
            unique: true,
        },
        password : {
            type: String,
            required: true,
        },
    }
)

const UserModel = mongoose.model('User', UserSchema);

module.exports = UserModel;