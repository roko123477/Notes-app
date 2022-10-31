const mongoose= require('mongoose');
const Schema=mongoose.Schema;

const ImageSchema= new Schema({
    url:String,
    filename: String
});

ImageSchema.virtual('thumbnail').get(function () {
    return this.url.replace('/upload', '/upload/w_200');
});

const opts = {
    toJSON: {
        virtuals: true
    }
};

const notesSchema= new Schema({
    title:String,
    images:[ImageSchema],
    description:String,
    author:{
        type:Schema.Types.ObjectId,
        ref: 'User'
    },
    lastUpdated:Number
},opts);

notesSchema.index({
    title: "text"
});

notesSchema.virtual('lastUpdatedString').get(function() {
    const oneDay = 1000 * 60 * 60 * 24;
    //console.log(Date.now());
   // console.log(this.lastUpdated);
    const days = (Date.now()-this.lastUpdated) / oneDay;
    //console.log(days);
    
    if (days < 1) {
        return 'Just today';
    } else if (days < 2) {
        return '1 day ago'
    }
    else     
        return Math.floor(days) + ' days ago';
});

module.exports=mongoose.model('Notes',notesSchema);

