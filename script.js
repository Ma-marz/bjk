

document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    // Get the user's input
    const name = document.getElementById('name').value;
    const password = document.getElementById('password').value;

    // Check if the credentials are valid
    fetch('users.json')
        .then(response => response.json())  // Parse the JSON data
        .then(users => {
            const user = users.find(user => user.name === name && user.password === password);

            if (user) {
                // If user found, show personalized content
                document.getElementById('welcome').style.display = 'block';
                document.getElementById('userName').textContent = user.name;
                document.getElementById('error').style.display = 'none';

                // Optionally, store user login status in local storage to remember the login
                localStorage.setItem('loggedInUser', JSON.stringify(user));
                document.getElementById('loginForm').style.display = 'none';
            } else {
                // If credentials are invalid, show error message
                document.getElementById('error').style.display = 'block';
                document.getElementById('welcome').style.display = 'none';
            }
        })
        .catch(error => console.error('Error fetching user data:', error));
});

// Check if user is already logged in (using localStorage)
window.onload = function() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (loggedInUser) {
        const user = JSON.parse(loggedInUser);
        document.getElementById('welcome').style.display = 'block';
        document.getElementById('userName').textContent = user.name;
        document.getElementById('error').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
    }
};

// Handle Logout
document.getElementById('logoutButton')?.addEventListener('click', function() {
    // Remove user data from localStorage
    localStorage.removeItem('loggedInUser');
    // Hide welcome message and show login form
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('error').style.display = 'none';
});
