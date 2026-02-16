

export default async function handler(req, res) {

    // This is a simple auth check to check if password is correct or not
    if (req.method === 'GET') {
        
        // First check the client's password against the real password on Vercel
        const { clientSecret } = req.query;
        if (!checkPassword(clientSecret)) {
            console.log("Client's password is wrong:", clientSecret);
            return res.status(401).json({
                success: false,
                message: "Invalid password, get outta here ya rascal!"
            });
        } else {
            console.log("Client has the right password:", clientSecret);
            return res.status(200).json({
                success: true,
                message: "Password accepted! Get in you big ol bag of beans"
            });
        }
    } 
  
    // Method not allowed
    return res.status(405).json({
        success: false,
        error: 'Method not allowed. Use GET to check if password is valid'
    });
}

export function checkPassword(clientSecret) {
    const vercelClientSecret = process.env.CHESS_SECRET;
    return (clientSecret === vercelClientSecret);
}
