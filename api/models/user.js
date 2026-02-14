import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password:{
        type: String ,
         required: true,

    },
    lastseen:{
        type: Date,
        default: Date.now,
    },
    isOnline:{
        type: Boolean,
        default: false,
    }
});


userSchema.pre('save' , async function (){
    if(this.isModified('password')){
        this.password = await bcrypt.hash(this.password , 12);
    }
   
});

userSchema.methods.comparePassword = async function (candidatePassword , userPassword){
    return await bcrypt.compare(candidatePassword , userPassword);
}

export default mongoose.model('User' , userSchema);