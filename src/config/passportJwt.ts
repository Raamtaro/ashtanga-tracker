import prisma from "../lib/prisma.js";
import {Strategy as JwtStrategy, ExtractJwt} from 'passport-jwt';

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in env");
}

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET as string
}

export const jwtStrategy = new JwtStrategy(opts, async (jwt_payload, done)=> {
    try {
        const user = await prisma.user.findUnique({where: {id: jwt_payload.userId}});
        if (user) {
            return done(null, user)
        } else {
            return done(null, false)
        }
    } catch (error) {
        return done(error, false)
    }
})