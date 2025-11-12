const express = require('express');
const mongoose = require('mongoose');
const Registeruser = require('../model/usersmodel');

const app = express();
const router= express.Router();

router.post('/register',async (req, res) =>{
    try{
        const {username,email,phoneno,password,confirmpassword} = req.body;
        let exist = await Registeruser.findOne({email})
        if(exist){
            return res.status(400).send('User Already Exist')
        }
        if(password !== confirmpassword){
            return res.status(400).send('Passwords are not matching');
        }
        let newUser = new Registeruser({
            username,
            email,
            phoneno,
            password,
            confirmpassword
        })
        await newUser.save();
        res.status(200).send('Registered Successfully')

    }
    catch(err){
        console.log(err)
        return res.status(500).send('Internel Server Error')
    }
})

module.exports= router;