# KindNest Server

KindNest Server is the Express API for the [KindNest community events platform](https://kindnest-client.vercel.app). It stores events, event joins, and profile pictures in MongoDB and protects user-specific operations with JWT authentication.

- **Live API:** https://kindnest-server.vercel.app
- **Client:** https://kindnest-client.vercel.app
- **Server repository:** https://github.com/mdabuhanif230/KindNest-Server
- **Client repository:** https://github.com/mdabuhanif230/KindNest-Client

## Features

- List upcoming events and retrieve event details.
- Create, update, and delete events with authenticated owner checks.
- Join events and retrieve events joined by the authenticated user.
- Prevent duplicate joins to the same event.
- Upload and retrieve profile pictures.
- Validate event fields and reject dates that are not in the future.
- Configure allowed client origins for cross-origin requests.

## Tech stack

- Node.js and Express
- MongoDB
- JSON Web Tokens (JWT)

## Run locally

Requirements: Node.js and access to a MongoDB database.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the server directory:

   ```env
   MONGODB_URI=your-mongodb-connection-string
   JWT_SECRET=use-the-same-long-secret-as-the-client
   CLIENT_URL=http://localhost:3000
   PORT=5000
   ```

   Set `JWT_SECRET` to the same value configured in the client. `CLIENT_URL` may contain multiple comma-separated origins.

3. Start the API:

   ```bash
   npm run dev
   ```

   The API is available at http://localhost:5000.

## API routes

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/` | Public | Check that the API is running |
| `GET` | `/events` | Public | List upcoming events; optional `type`, `search`, `limit` (max 100), and `skip` (max 10000) query parameters |
| `GET` | `/events/:id` | Public | Get an event |
| `POST` | `/events` | JWT required | Create an event |
| `GET` | `/my-events` | JWT required | List events created by the current user |
| `PUT` | `/events/:id` | JWT required | Update an owned event |
| `DELETE` | `/events/:id` | JWT required | Delete an owned event |
| `POST` | `/events/:id/join` | JWT required | Join an event |
| `GET` | `/joined` | JWT required | List events joined by the current user |
| `POST` | `/avatar` | JWT required | Save a profile picture |
| `GET` | `/avatar/:email` | Public | Retrieve a profile picture |

For protected routes, send the client-issued token in the `Authorization: Bearer <token>` header.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API with Node.js watch mode |
| `npm start` | Start the API |

## Related project

The Next.js web application and its setup instructions are in the [KindNest Client repository](https://github.com/mdabuhanif230/KindNest-Client).
