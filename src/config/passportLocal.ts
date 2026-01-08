import prisma from "../lib/prisma.js";
import bcrypt from 'bcryptjs'
import {Strategy as LocalStrategy} from 'passport-local';


export const localStrategy = new LocalStrategy(
    { usernameField: 'email'},
    async (email, password, done) => {
        try {
            const user = await prisma.user.findUnique( { where: {email}});
            if (!user) {
                return done(null, false, {message: 'Incorrect Email.'});
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return done(null, false, { message: 'Incorrect Password.'});
            }
            return done(null, user);
        } catch(error) {
            return done(error);
        }
    }
);