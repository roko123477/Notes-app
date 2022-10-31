if(process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const app = express();
const mongoose = require('mongoose');
const path = require('path');
const methodOverride = require('method-override');
const Notes= require('./models/notes');
const ejsMate= require('ejs-mate');
const session = require('express-session');
const flash= require('connect-flash');
const ExpressError= require('./utils/ExpressError');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const User = require('./models/user');
const MongoStore = require('connect-mongo');
const {isLoggedIn,ValidateNotes}= require('./middleware');
const catchAsync= require('./utils/catchAsync');
const {cloudinary} = require("./cloudinary");
const multer  = require('multer');
const {storage}= require('./cloudinary');
const upload = multer({storage});

var seachWord;
var allnotes={};



const dburl=process.env.MONGO_URL;
//mongodb://localhost:27017/yelp-camp

mongoose.connect(dburl)
    .then(()=>{
        console.log("Connected to MongoDb");
    })
    .catch(e=>{
        console.log(e);
    });


app.engine('ejs',ejsMate); 
app.set('view engine', 'ejs');
app.set('views',path.join(__dirname, 'views'));
app.use(express.urlencoded({extended: true}));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));


const secret =process.env.SECRET || 'thisshouldbeasecret';

const store = MongoStore.create({
    mongoUrl: dburl,
    touchAfter: 24 * 60 * 60,
    crypto: {
        secret
    }
});

store.on("error", function(e){
    console.log("session store error",e)
})

const sessionConfig={
    store,
    name:'session',
    secret,
    resave:false,
    saveUninitialized:true,
    cookie:{
        httpOnly:true,
       // secure:true,
        expires:Date.now() + (1000*60*60*24*7),
        maxAge:1000 * 60 * 60 * 24 * 7
    }
};
//this session should come first
app.use(session(sessionConfig));
app.use(flash());

 app.use(passport.initialize());
 app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req,res,next)=>{
   // console.log(req.user);
    res.locals.currentUser=req.user;
    res.locals.success=req.flash('success');
    res.locals.error=req.flash('error');
    next();
})

// app.get('/fakeUser', async(req, res)=>{
//     const user=new User({
//         email:"rohit@example.com",
//         username:'rohit'
//     });
//     const newuser=await User.register(user,'chicken');
//     res.send(newuser);
// });

app.get('/',(req,res)=>{
     res.render('home.ejs');
});

app.get('/notes',catchAsync(async(req,res)=>{
    const {id}=req.user;
 
  //  console.log(id);
    const notes=await Notes.find({'author':id});
   // console.log(notes[0].images[0].url);
    res.render("notes/index.ejs",{notes});
}));



app.post('/notes',isLoggedIn,upload.array('image'),ValidateNotes,catchAsync(async(req,res)=>{
    const note=new Notes(req.body.notes);
    note.lastUpdated=Date.now();
    note.author=req.user._id;
    note.images=req.files.map(f=>({url:f.path,filename:f.filename}));
    
    await note.save();
    
    return res.redirect(`/notes`);
}));

app.get('/notes/:id',isLoggedIn,catchAsync(async(req,res)=>{
    const note=await Notes.findById(req.params.id).populate('author');
    if(!note){
        return res.redirect('/notes');
    }
    res.render('notes/show.ejs',{note}); 
}));

// app.get('/:id/notes',async(req,res)=>{
//     const note=await Notes.findById(req.params.id).populate('author');

// })

app.get('/notes/:id/edit',isLoggedIn,catchAsync(async(req,res)=>{
    const {id}=req.params;
    const note=await Notes.findById(id);
    if(!note){
        req.flash('error', `We cannot find that note. It could already be deleted, or maybe the ID in the URL is incorrect.`);
        return res.redirect('/notes');
    }
    res.render("notes/edit.ejs",{note});
}));

app.put("/notes/:id",isLoggedIn,upload.array('image'),ValidateNotes,catchAsync(async(req,res)=>{
    const {id}=req.params;
    const note=await Notes.findByIdAndUpdate(id,{...req.body.notes});
    console.log(req.files);
    if (req.files.length) {
      //  console.log('Adding new images:', req.files);
        const imgs = req.files.map(img => ({
            url: img.path,
            filename: img.filename
        }));
        note.images.push(...imgs);
    }
    note.lastUpdated = Date.now();
    await note.save();
    const deletables = req.body.deleteImages;
    if (deletables) {
        for (let fileName of deletables) {
            await cloudinary.uploader.destroy(fileName);
         //   console.log('Destroyed: ', fileName);
        }

        await note.updateOne({
            $pull: {
                images: {
                    filename: {
                        $in: deletables
                    }
                }
            }
        });

        console.log('DELETED:', deletables);
    }

    req.flash('success', `Successfully edited ${ note.title }.`);
   
    return res.redirect(`/notes/${note.id}`);
}));

app.delete("/notes/:id",isLoggedIn,catchAsync(async(req,res)=>{
    const {id} = req.params;
   // console.log('deleting ID:', id);

    const note = await Notes.findById(id);

    // console.log('DELETING:', camp);

    for (let img of note.images) {
        await cloudinary.uploader.destroy(img.filename);
     //   console.log('Destroyed:', img.filename);
    }

    await Notes.findByIdAndDelete(id);
    req.flash('success', `Successfully deleted the notes.`);
    return res.redirect('/notes');
}));

app.get('/autocomplete',isLoggedIn,async(req, res, next)=> {

    var regex= new RegExp(req.query["term"],'i');
    const {id}=req.user;
    
  // console.log(id);
    var notes = await Notes.find({title:regex,'author':id},{'title':1}).sort({"updated_at":-1}).sort({"created_at":-1}).limit(20);
    
    var result=[];
    if(notes && notes.length && notes.length>0){
        notes.forEach(user=>{
            let obj={
            label: user.title
            };
            result.push(obj);
        });
     }
     res.jsonp(result);
    // console.log(result);
});


app.get('/search', isLoggedIn,async (req, res, next)=>{
    //console.log(allnotes);
    res.render('notes/search', { allnotes,seachWord});
})

app.post('/notes/search', isLoggedIn,async(req, res, next)=> {
    const {id}=req.user;
    var search = req.body.q;
    var flterParameter={}
   //console.log(search);
    
    if(search !=''){
        var flterParameter={ $and:[{ title:search},{$and:[{ 'author':id}]}]};
        var notes =await Notes.find(flterParameter);
        allnotes=notes;
        seachWord=search;
       
        return res.redirect('/search');
    }
    else{
        next(new ExpressError('Page not found',404));
    }
    
});


  

app.get('/register',(req,res)=>{
    res.render('users/register');
});

app.post('/register',catchAsync(async (req,res,next)=>{
    
    try {
        const {email, username,password} = req.body;
        const user=new User({email, username});
        const registerUser=await User.register(user,password);
       // console.log(registerUser);
       req.login(registerUser,err =>{
       if(err){
            return next(err);
        }
        req.flash('success','welcome to Notify!');
        return res.redirect('/notes');
       });
        
    }
    catch(e){
        console.log(e);
        req.flash('error',e.message);
        return res.redirect('/register');
    }
}));



app.get('/login',(req,res)=>{
    res.render('users/login');
});

app.post('/login',passport.authenticate('local',{failureFlash:true,failureRedirect:'/login',failureMessage: true,keepSessionInfo: true}),(req,res)=>{
    req.flash('success', 'Welcome back');
    const redirectUrl= (req.session.returnTo || '/notes');
   delete req.session.returnTo;
    return res.redirect(redirectUrl);
});


app.get('/logout',(req,res)=>{
    req.logout(function(err) {
        req.flash('success', 'Logout Success');
        if (err) { return next(err); }
        
       return res.redirect('/');
    });
});

app.all('*',(req,res,next)=>{
    next(new ExpressError('Page not found',404));
});

app.use((err, req, res,next)=>{
    const {statusCode =500} = err;
    if(!err.message) err.message='oh no, Something went wrong!';
    res.status(statusCode).render('error.ejs',{err});
    
});

// function escapeRegex(text) {
//     return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
// };

const port=3000;
app.listen(port,()=>{
    console.log(`listening on port ${port}`);
})
