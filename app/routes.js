var ObjectId = require('mongodb').ObjectId;

module.exports = function (app, passport, db) {
  // help with Sherrell
  // normal routes ===============================================================

  // show the home page (will also have our login links)
  app.get('/', function (req, res) {
    res.render('index.ejs');
  });

  // PROFILE SECTION =========================
  app.get('/profile', isLoggedIn, function (req, res) {
    db.collection('address').find().toArray((err, result) => {
      if (err) return console.log(err)
      res.render('profile.ejs', {
        user: req.user,
        homes: result
      })
    })
  });

  // LOGOUT ==============================
  app.get('/logout', function (req, res) {
    req.logout(() => {
      console.log('User has logged out!')
    });
    res.redirect('/');
  });

  // home tracker routes ===============================================================

  app.post('/homes', (req, res) => {
    db.collection('address').save({ 
      address: req.body.address, 
      price: req.body.price, 
      comments: req.body.comments,
      listingUrl: req.body.listingUrl || '',
      status: req.body.status || 'Not Visited',
      loveit: 0, 
      hateit: 0 
    }, (err, result) => {
      if (err) return console.log(err)
      console.log('Home saved to database')
      
      // Save to separate collections if needed
      db.collection('comments').save({ 
        homeId: result.insertedId, 
        comments: req.body.comments 
      }, (err) => {
        if (err) console.log(err)
      })
      
      db.collection('prices').save({ 
        homeId: result.insertedId, 
        price: req.body.price 
      }, (err) => {
        if (err) console.log(err)
      })

      if (req.body.listingUrl) {
        db.collection('links').save({
          homeId: result.insertedId,
          listingUrl: req.body.listingUrl
        }, (err) => {
          if (err) console.log(err)
        })
      }
      
      res.redirect('/profile')
    })
  })

  app.put('/homes', (req, res) => {
    const isLoveIt = Object.keys(req.body).includes('loveit') // .includes checks if loveit is in the array
    const countValue = isLoveIt ?
      //checking if loveit is true or false
      (req.body.loveit || 0) + 1 :
      (req.body.hateit || 0) + 1;
    
    const updateField = isLoveIt ? 'loveit' : 'hateit';
    
    db.collection('address')
      .findOneAndUpdate({ _id: ObjectId(req.body.homeId) }, {
        $set: {
          [updateField]: countValue
        }
      }, {
        sort: { _id: -1 },
        upsert: false
      }, (err, result) => {
        if (err) return res.send(err)
        
        // Also update separate collections
        if (isLoveIt) {
          db.collection('loveit').save({ 
            homeId: ObjectId(req.body.homeId),
            count: countValue
          }, (err) => {
            if (err) console.log(err)
          })
        } else {
          db.collection('hateit').save({ 
            homeId: ObjectId(req.body.homeId),
            count: countValue
          }, (err) => {
            if (err) console.log(err)
          })
        }
        
        res.send(result)
      })
  })

  app.delete('/homes', (req, res) => {
    const homeId = ObjectId(req.body.homeId)
    db.collection('address').findOneAndDelete({ _id: homeId }, (err, result) => {
      if (err) return res.send(500, err)
      
      // Also delete from related collections
      db.collection('comments').deleteMany({ homeId: homeId }, (err) => {
        if (err) console.log(err)
      })
      db.collection('prices').deleteMany({ homeId: homeId }, (err) => {
        if (err) console.log(err)
      })
      db.collection('loveit').deleteMany({ homeId: homeId }, (err) => {
        if (err) console.log(err)
      })
      db.collection('hateit').deleteMany({ homeId: homeId }, (err) => {
        if (err) console.log(err)
      })
      
      res.send('Home deleted!')
    })
  })

  app.post('/homes/update', (req, res) => {
    const homeId = req.body.homeId
    if (!homeId) return res.redirect('/profile')

    const homeObjectId = ObjectId(homeId)
    const updateDoc = {
      address: req.body.address,
      price: req.body.price,
      comments: req.body.comments,
      status: req.body.status || 'Not Visited',
      listingUrl: req.body.listingUrl || ''
    }

    db.collection('address').findOneAndUpdate(
      { _id: homeObjectId },
      { $set: updateDoc },
      { returnDocument: 'after' },
      (err) => {
        if (err) {
          console.log(err)
          return res.redirect('/profile')
        }

        db.collection('comments').updateOne(
          { homeId: homeObjectId },
          { $set: { comments: req.body.comments } },
          { upsert: true }
        )

        db.collection('prices').updateOne(
          { homeId: homeObjectId },
          { $set: { price: req.body.price } },
          { upsert: true }
        )

        db.collection('links').updateOne(
          { homeId: homeObjectId },
          { $set: { listingUrl: req.body.listingUrl || '' } },
          { upsert: true }
        )

        res.redirect('/profile')
      }
    )
  })

  // =============================================================================
  // AUTHENTICATE (FIRST LOGIN) ==================================================
  // =============================================================================

  // locally --------------------------------
  // LOGIN ===============================
  // show the login form
  app.get('/login', function (req, res) {
    res.render('login.ejs', { message: req.flash('loginMessage') });
  });

  // process the login form
  app.post('/login', passport.authenticate('local-login', {
    successRedirect: '/profile', // redirect to the secure profile section
    failureRedirect: '/login', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
  }));

  // SIGNUP =================================
  // show the signup form
  app.get('/signup', function (req, res) {
    res.render('signup.ejs', { message: req.flash('signupMessage') });
  });

  // process the signup form
  app.post('/signup', passport.authenticate('local-signup', {
    successRedirect: '/profile', // redirect to the secure profile section
    failureRedirect: '/signup', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
  }));

  // =============================================================================
  // UNLINK ACCOUNTS =============================================================
  // =============================================================================
  // used to unlink accounts. for social accounts, just remove the token
  // for local account, remove email and password
  // user account will stay active in case they want to reconnect in the future

  // local -----------------------------------
  app.get('/unlink/local', isLoggedIn, function (req, res) {
    var user = req.user;
    user.local.email = undefined;
    user.local.password = undefined;
    user.save(function (err) {
      res.redirect('/profile');
    });
  });

};

// route middleware to ensure user is logged in
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated())
    return next();

  res.redirect('/');
}
