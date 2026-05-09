# Real-Scribe

Real-Scribe is a real-time, collaborative whiteboard and document editing application. It allows multiple users to draw, write, and collaborate on a shared canvas in real time.

## 🚀 Features

- **Real-time Collaboration:** Instantly see changes made by other users on the same document using WebSockets.
- **Interactive Whiteboard:** Draw, sketch, and write with various tools.
- **Cloud Database:** Persistent storage of documents and drawings using MongoDB Atlas.
- **Modern UI:** Built with React and Vite for a fast and responsive user experience.
- **RESTful API:** Node.js and Express backend handling secure data transactions.

## 🛠️ Technology Stack

**Frontend:**
- React (with Vite)
- Socket.io-client (for real-time communication)
- Tailwind CSS (or Vanilla CSS for styling)

**Backend:**
- Node.js & Express.js
- Socket.io (WebSocket server)
- MongoDB & Mongoose (Database and ORM)

## 💻 Running Locally

### Prerequisites
- Node.js (v18 or higher)
- A MongoDB database (local or Atlas cloud instance)

### 1. Clone the repository
```bash
git clone https://github.com/your-username/Real-Scribe.git
cd Real-Scribe
```

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `Backend` directory and add your MongoDB connection string and Port:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=3001
   CORS_ORIGIN=http://localhost:5173
   ```
4. Start the backend server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd Frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `Frontend` directory (if needed) for any environment variables.
4. Start the development server:
   ```bash
   npm run dev
   ```

## 🌐 Deployment

The application is designed to be easily deployed to modern cloud platforms:
- **Frontend:** Vercel, Netlify, or similar static hosting.
- **Backend:** Render, Heroku, or any Node.js hosting platform.
- **Database:** MongoDB Atlas.

Ensure you update the `CORS_ORIGIN` in your backend environment variables to match your frontend deployment URL once deployed.

## 📝 License

This project is licensed under the MIT License.
