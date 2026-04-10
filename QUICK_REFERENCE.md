# Quick Reference: Adding More Pages

## Template for Converting New HTML Pages

### Step 1: Create the Page Component
Create `src/pages/PageName.jsx`:

```jsx
import React, { useEffect } from 'react'
import './PageName.css'

export default function PageName() {
  useEffect(() => {
    // Any initialization code here
  }, [])

  return (
    <main className="page-name">
      {/* Your content here */}
    </main>
  )
}
```

### Step 2: Create the Page Styles
Create `src/pages/PageName.css`:

```css
.page-name {
  padding: 20px;
  /* Your styles here */
}

/* Use CSS variables from Header.css */
:root variables already defined:
- --primary
- --secondary
- --text-color
- --card-bg
- --shadow
- --shadow-hover
```

### Step 3: Add Route to App.jsx
Import the page and add route:

```jsx
import PageName from './pages/PageName'

// Inside <Routes>
<Route path="/pagename" component={<PageName />} />
```

### Step 4: Update Navigation Link in Header (if needed)
Edit `src/components/Header.jsx` to add new nav link

---

## Important Path Updates

### From HTML:
```html
<img src="image.png" alt="Image" />
<a href="page.html">Link</a>
```

### To React:
```jsx
<img src="/image.png" alt="Image" />  {/* Public folder */}
<Link to="/page">Link</Link>           {/* React Router */}
```

---

## Asset Organization

### Image Files: `public/`
- Keep all images in the public folder
- Reference as: `<img src="/filename.png" />`

### Component Files: `src/`
- Page components: `src/pages/PageName.jsx`
- Reusable components: `src/components/ComponentName.jsx`
- Custom hooks: `src/hooks/useHookName.js`

---

## Common Conversions

### Inline Styles → CSS Classes
❌ **Don't:**
```jsx
<div style={{fontSize: '2rem', color: 'red'}}>Text</div>
```

✅ **Do:**
```jsx
<div className="large-text">Text</div>
```
```css
.large-text {
  font-size: 2rem;
  color: red;
}
```

### Navigation Links
❌ **Don't:**
```jsx
<a href="dashboard.html">Dashboard</a>
```

✅ **Do:**
```jsx
import { Link } from 'react-router-dom'
<Link to="/dashboard">Dashboard</Link>
```

### Local Storage
❌ **Don't:**
```jsx
localStorage.setItem('user', JSON.stringify(user))
const user = JSON.parse(localStorage.getItem('user'))
```

✅ **Do:**
```jsx
import { useLocalStorage } from '../hooks/useLocalStorage'
const [user, setUser] = useLocalStorage('user', null)
```

### Dark Mode
✅ **Already implemented** - Just add dark mode CSS:
```css
body.dark .my-element {
  background-color: #333;
  color: #fff;
}
```

---

## Testing Your New Page

1. Start dev server: `npm run dev`
2. Navigate to your new route
3. Check console for errors
4. Verify styling looks correct
5. Test responsive design (mobile view)
6. Test dark mode toggle

---

## File Checklist

When converting HTML files:

- [ ] Create `src/pages/PageName.jsx`
- [ ] Create `src/pages/PageName.css`
- [ ] Copy CSS variables from Header.css
- [ ] Update all image paths to `/image.png`
- [ ] Replace `<a>` links with `<Link>`
- [ ] Replace `onclick` with React `onClick`
- [ ] Extract inline styles to CSS
- [ ] Add route to `App.jsx`
- [ ] Test on both light and dark modes
- [ ] Test on mobile (768px viewport)

---

## CSS Variables Reference

Use these pre-defined colors for consistency:

```css
:root {
  --primary: #667eea;
  --secondary: #764ba2;
  --success: #48bb78;
  --warning: #ed8936;
  --text-color: #1a202c;
  --card-bg: #ffffff;
  --shadow: 0 10px 30px rgba(102, 126, 234, 0.1);
  --shadow-hover: 0 20px 40px rgba(102, 126, 234, 0.2);
}
```

Dark mode automatically overrides these when `.dark` class is added to body.

---

## Need Help?

Refer to:
- `src/pages/Home.jsx` - Complete example
- `src/pages/Login.jsx` - Form example
- `src/components/Header.jsx` - Component with hooks example
- `src/hooks/useTheme.js` - Custom hook example

---

**Happy coding! 🚀**
