const express = require('express');
const mongoose = require('mongoose');

const jwt = require('jsonwebtoken');
var users=require('./routes/register');
var loging=require('./routes/login');
var planpage=require('./routes/Planpage');
var results=require('./routes/resultsPage');
const cors = require('cors');
const app = express();
const PORT= process.env.PORT || 5000;
require("dotenv").config();


mongoose.connect(process.env.MONGO_URL,{
    useUnifiedTopology: true,
    useNewUrlParser: true   
}).then(
    () => console.log('DB Connection established')
)

app.use(express.json());

app.use(cors({origin:"*"}))
app.use('/users',users);
app.use('/loging',loging);
app.use('/planpage',planpage);
app.use('/results',results);


app.listen(PORT,()=>{
    console.log('Server running...')
})

app.use('/',(req,res)=>{
    res.send("welcome to planmateai backend");
})