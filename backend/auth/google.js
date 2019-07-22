const { OAuth2Client } = require('google-auth-library')
const GOOGLE_SIGNIN_CLIENT_ID = process.env.GOOGLE_SIGNIN_CLIENT_ID

let DOMAIN_ALLOW_LIST = []
if (process.env.GOOGLE_SIGNIN_DOMAIN_ALLOW_LIST) {
  DOMAIN_ALLOW_LIST = process.env.GOOGLE_SIGNIN_DOMAIN_ALLOW_LIST.split(',')
}

async function authGoogle (idToken) {
  const googleOAuthClient = new OAuth2Client(GOOGLE_SIGNIN_CLIENT_ID)
  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: idToken,
    audience: GOOGLE_SIGNIN_CLIENT_ID
  })

  const payload = ticket.getPayload()
  console.log(DOMAIN_ALLOW_LIST, payload)

  if (DOMAIN_ALLOW_LIST.length > 0) {
    if (DOMAIN_ALLOW_LIST.indexOf(payload.hd) !== -1) {
      throw new Error(`invalid domain: ${payload.hd}`)
    }
  }

  let userID = payload['sub']
  let nickname = payload['email'].split('@')[0]
  return { token: userID, name: nickname }
}

module.exports = authGoogle
