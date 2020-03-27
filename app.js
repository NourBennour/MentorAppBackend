const express = require('express')
const bodyParser = require('body-parser')
const mongodb = require('mongodb')
const ObjectId = require('mongodb').ObjectId
const bcrypt = require('bcrypt-node') // to hash the passwords  
const jwt = require('jsonwebtoken') // for security
const nodemailer = require('nodemailer')
const app = express()

app.use(bodyParser.json())

const connection = (closure) => {
    return mongodb.connect('mongodb://localhost:27017/mentorDb', { useUnifiedTopology: true }, (err, client) => {
        if (err) throw err;
        let db = client.db('mentorDb')
        closure(db)
    })
}

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post('/login', (req, res) => {
    connection(async (db) => {
        const user = await db.collection('user').findOne({ email: req.body.email })
        if (!user) { return res.send({ msg: 'bad email' }) };
        if (!bcrypt.compareSync(req.body.password, user.password)) { return res.send({ msg: 'bad password' }) }
        user.password = '';
        return res.send({ msg: 'ok', user, token: jwt.sign({ user }, 'mySuperSecretString', { expiresIn: '7d' }) })
    })
})
app.post('/addUser', (req, res) => {
    connection(async (db) => {
        req.body.password = bcrypt.hashSync(req.body.password)
        const user = await db.collection('user').insert(req.body)
        return res.send({ msg: 'user added', user })
    })
})

app.post('/addRequest', (req, res) => {
    connection(async (db) => {
        req.body['date'] = Date.now()
        req.body['state'] = 'pending'
        const mentor = await db.collection('requests').insertMany(req.body)
        return res.send({ msg: 'ok', mentor })
    })
})

app.get('/getProfessorsEmails', (req, res) => {
    connection(async (db) => {
        const emails = await db.collection('user').find({ role: 'professor' }).toArray()
        return res.send({ msg: 'ok', emails: emails.map(p => p.email) })
    })
})

app.post('/listMentors', (req, res) => {
    connection(async (db) => {
        let mentors = []
        if (req.body.course !== '') {
            mentors = await db.collection('mentors').find({ course: req.body.course }).toArray();
        } else {
            mentors = await db.collection('mentors').find().toArray();
        }
        const users = await db.collection('user').find().toArray();
        const mentorsData = await mentors.map(m => ({ ...m, user: users.filter(u => u.email === m.email)[0] }))
        return res.send({ msg: 'ok', users: mentorsData })
    })
})

app.post('/listRequest', (req, res) => {
    connection(async (db) => {
      
        const result = await db.collection('requests').find({ professorEmail: req.body.email, state: 'pending' }).toArray();
        
        return res.send(result)
    })
})

app.post('/updateRequest', (req, res) => {
    connection(async (db) => {
        const request = await db.collection('requests').findOne({ _id: ObjectId(req.body._id) })
        const result = await db.collection('requests').update({ _id: ObjectId(req.body._id) }, { $set: { state: req.body.state } });
        if (req.body.state === 'accepted') {
            request['date'] = Date.now()
            await db.collection('user').updateOne({ email: request.email }, { $set: { role: 's-mentor' } });
            const mentor = await db.collection('mentors').insert(
                {
                    email: request.email,
                    date: Date.now(),
                    message: request.message,
                    availibility: request.availibility,
                    course: request.course
                })
        }
        return res.send(result)
    })
})

app.post('/addMentor', (req, res) => {
    connection(async (db) => {
        req.body['date'] = Date.now()
        await db.collection('user').updateOne({ email: req.body.email }, { $set: { role: 'p-mentor' } });
        const mentor = await db.collection('mentors').insert(
            {
                email: req.body.email,
                date: Date.now(),
                message: req.body.message,
                availibility: req.body.availibility
            })
        return res.send({ msg: 'ok', mentor })
    })
})

app.get('/sendEmail', async (req, res) => {
    await sendEmail('hello', 'this is a test')
    res.send({ msg: 'mail sent' })
})

const sendEmail = async (sub, body) => {
    const connection = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: true, // upgrade later with STARTTLS
        auth: {
            user: "iheb.jendoubi@medtech.tn",
            pass: "NodeTestPassword12345"
        }
    });
    const message = {
        from: "iheb.jendoubi@medtech.tn",
        to: "nour@medtech.tn",
        subject: sub,
        text: "",
        html: body
    };
    return await connection.sendMail(message)
}

app.listen(3000, (err) => {
    if (err) throw err;
    console.log('server is running on port 3000')
})