# Robotics Education Website + Admin Dashboard (No-code content editing)

This project is a simple full-stack website for your **Community Engagement through Robotics Education** group project.

✅ Public website: visitors watch videos + read explanations  
✅ Admin dashboard: teammates can **add/edit/delete** videos, images, text, quizzes — **without touching code**  
✅ Supports both:
- **Online videos** (YouTube URL embed)
- **Uploaded MP4 videos** (stored locally in `/public/uploads`)

---

## 1) Requirements
- Node.js 18+ (recommended)
- npm

---

## 2) Install & Run
```bash
npm install
npm start
```

Open:
- Public site: http://localhost:3000
- Admin dashboard: http://localhost:3000/admin

---

## 3) Default login (CHANGE AFTER FIRST RUN)
- Username: **admin**
- Password: **admin123**
- Role: **admin**

You can create editor accounts from **Admin → Users** (admin only).

---

## 4) How teammates add content (no coding)
1. Go to `/admin`
2. Login
3. Create a Page (title + slug + audience)
4. Add Blocks to that page:
   - Text
   - Image
   - Video (YouTube OR MP4 upload)
   - Callout (Key idea / Fun fact)
   - Quiz (MCQs)
5. Publish the page

---

## 5) Hosting (simple choices)
- Render / Railway / Fly.io (Node hosting)
- Any VPS (PM2)
- If you need HTTPS + domain later, add a reverse proxy (Nginx).

---

## 6) Notes
- Content is stored in a SQLite database (`data.sqlite` in the project root).
- Uploads are stored in `public/uploads/`.
- For big videos, consider using YouTube links or cloud storage later.

Good luck with your project!
