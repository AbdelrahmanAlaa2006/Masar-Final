# Masaar React App - Conversion Guide

## Project Structure

The project has been successfully converted from vanilla HTML/CSS/JS to a modern React application with the following structure:

```
src/
├── components/
│   ├── Header.jsx              # Reusable header with navigation, theme toggle, logout
│   └── Header.css              # Header styling with animations
├── pages/
│   ├── Home.jsx                # Home page with hero, cards, greeting section
│   ├── Home.css                # Home page styling with particles
│   ├── Login.jsx               # Login page with form validation
│   ├── Login.css               # Login page styling
│   ├── Dashboard.jsx           # (Existing)
│   ├── Dashboard.css           # (Existing)
│   ├── About.jsx               # (Existing)
│   └── About.css               # (Existing)
├── hooks/
│   ├── useTheme.js             # Custom hook for theme management
│   └── useLocalStorage.js      # Custom hook for localStorage operations
├── App.jsx                     # Main app with routing
├── App.css                     # App-level styles
├── main.jsx                    # React entry point
└── index.css                   # Global styles

public/
├── logo.white.png              # (To be added)
├── background3.jpeg            # (To be added)
├── pdf_5663275.png             # (To be added)
├── exam_5663142.png            # (To be added)
├── application-file_11607583.png # (To be added)
└── resume_17869459.png         # (To be added)
```

## Key Features Implemented

### 1. **Header Component** (`src/components/Header.jsx`)
- Navigation menu with all page links
- Theme toggle (dark/light mode)
- Logout button with animation
- Responsive design
- Uses React Router for navigation
- Stores theme preference in localStorage

### 2. **Login Page** (`src/pages/Login.jsx`)
- Form validation (minimum 3 characters)
- Language toggle (English/Arabic)
- Password visibility toggle
- Loading state animation
- Success animation on login
- Stores user data in localStorage
- Auto-redirects to home page on successful login

### 3. **Home Page** (`src/pages/Home.jsx`)
- Hero section with call-to-action
- Interactive cards grid (Lectures, Exams, Videos, Reports)
- Greeting section with user's name
- Social media icons (GitHub, WhatsApp, Facebook, LinkedIn, Gmail)
- Particle animation effects
- Scroll animations for cards
- Responsive design

### 4. **Custom Hooks**
- `useTheme()`: Manages dark/light mode state and localStorage
- `useLocalStorage()`: Generic hook for localStorage operations

### 5. **Routing** (`App.jsx`)
- Login route (`/login`) - Header hidden on login page
- Home route (`/`) - Default page with header
- Dashboard route (`/dashboard`)
- Other routes with header visible

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Add Required Assets
Copy the following image files to the `public/` folder:
- `logo.white.png` - Company logo
- `background3.jpeg` - Login page background
- `pdf_5663275.png` - Lectures icon
- `exam_5663142.png` - Exams icon
- `application-file_11607583.png` - Videos icon
- `resume_17869459.png` - Reports icon

### 3. Run Development Server
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

## CSS Variables

The app uses CSS variables for consistent theming:

**Light Mode (default):**
- Primary gradient: `#667eea` → `#764ba2`
- Background: Light gradient
- Text color: `#1a202c`
- Card background: `#ffffff`

**Dark Mode:**
- Background: Dark gradient
- Text color: `#f7fafc`
- Card background: `#2d3748`

Toggle theme with the button in the header!

## User Authentication Flow

1. User visits `/login`
2. Enters username and password (min 3 characters each)
3. Clicks login → Loading animation
4. Data stored in localStorage as `masar-user` JSON
5. Success animation displayed
6. Auto-redirected to home page
7. Home page displays user's greeting with their username
8. Header shows logout button to clear session

## Language Support

The Login page supports:
- **English** (default)
- **Arabic** (RTL layout)

Language preference is stored in localStorage as `lang`

## Styling Approach

- **Global CSS Variables**: Used for colors, gradients, shadows
- **Component-level CSS**: Each component has its own CSS file
- **CSS Animations**: Smooth transitions and keyframe animations
- **Responsive Design**: Mobile-first approach with media queries
- **RTL Support**: HTML includes `dir="rtl"` for Arabic support

## File Paths

All asset paths reference the `public/` folder:
- Example: `<img src="/logo.white.png" />`

Social media icons use CDN links:
- GitHub: `devicon` CDN
- WhatsApp, Facebook, LinkedIn, Gmail: `flaticon` CDN

## Available Routes

- `/` - Home page
- `/login` - Login page
- `/dashboard` - Dashboard page
- `/about` - About page

## Theme Persistence

The selected theme (dark/light) is automatically saved to localStorage and restored on page reload.

## Next Steps

1. Add the required image assets to the `public/` folder
2. Customize the social media links in `src/pages/Home.jsx`
3. Create additional page components as needed
4. Modify the Dashboard and About pages as required
5. Add more routes in `App.jsx` for new pages

---

**Note**: The project is fully converted to React and ready for further customization and deployment!
