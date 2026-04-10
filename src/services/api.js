// ===== AUTH (mock — database temporarily disabled) =====
const MOCK_USERS = [
  { id: 1, name: 'admin', password: 'admin', email: 'admin@masaar.com', role: 'admin' },
  { id: 2, name: 'student', password: 'student', email: 'student@masaar.com', role: 'student' },
]

export const authAPI = {

  // Login
  login: async (username, password) => {
    const user = MOCK_USERS.find(u => u.name === username && u.password === password)
    if (!user) {
      throw new Error('اسم المستخدم أو كلمة المرور غلط')
    }
    return { token: user.id.toString(), user }
  },

  // Logout
  logout: () => {
    tokenAPI.removeToken()
  },

  // Register
  register: async (username, password, email, role = 'student') => {
    const existing = MOCK_USERS.find(u => u.email === email)
    if (existing) {
      throw new Error('الإيميل ده موجود بالفعل')
    }
    const newUser = { id: MOCK_USERS.length + 1, name: username, password, email, role }
    MOCK_USERS.push(newUser)
    return { token: newUser.id.toString(), user: newUser }
  }
}

// ===== TOKEN =====
export const tokenAPI = {
  setToken: (token) => localStorage.setItem('masar-token', token),
  getToken: () => localStorage.getItem('masar-token'),
  removeToken: () => localStorage.removeItem('masar-token'),
  isLoggedIn: () => !!localStorage.getItem('masar-token')
}