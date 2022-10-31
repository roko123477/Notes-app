const BaseJoi = require('joi');
const ExpressError= require('./utils/ExpressError');
const Notes= require('./models/notes');

const sanitizeHtml = require('sanitize-html');

const extension = (joi) => ({
    type: 'string',
    base: joi.string(),
    messages: {
        'string.escapeHTML': '{{#label}} must not include HTML!'
    },
    rules: {
        escapeHTML: {
            validate(value, helpers) {
                const clean = sanitizeHtml(value, {
                    allowedTags: [],
                    allowedAttributes: {},
                });
                if (clean !== value) return helpers.error('string.escapeHTML', { value })
                return clean;
            }
        }
    }
});

const Joi = BaseJoi.extend(extension)

//validate campground model no one can interfare through postman
module.exports.ValidateNotes=(req, res, next) => {
    const notesSchema=Joi.object({
        notes:Joi.object({
           title: Joi.string().required().escapeHTML(),
           
           description: Joi.string().required().escapeHTML()})
    })
    const {error}=notesSchema.validate(req.body);
    if(error){
             msg=error.details.map(el=>el.message).join(',');
        throw new ExpressError(msg,400);
    }
    else{
        next();
    }
        
}

//validate review model no one can interfare through postman


module.exports.isLoggedIn=(req, res, next) => {
   // console.log("req user:",req.user);
    if(!req.isAuthenticated()){
        req.session.returnTo=req.originalUrl;
        req.flash('error', 'you must be signed in');
        return res.redirect('/login');
    }
    next();
    
}








