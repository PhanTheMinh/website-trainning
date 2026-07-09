function authenticate(req, res, next) {
    if (req.session && req.session.user) {
        req.user = req.session.user
        console.log(req.session.user)
        return next();
    }

    return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập!"
    });
}

module.exports = authenticate;