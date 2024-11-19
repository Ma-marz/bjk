

document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    // Get the user's input
    const name = document.getElementById('name').value;
    const password = document.getElementById('password').value;

    // Check if the credentials are valid
    fetch('users.json')
        .then(response => response.json())  // Parse the JSON data
        .then(users => {
            const isNotRandomUser = users.find(user => user.name.toLowerCase() === name.toLowerCase());
            const randomUser = users.find(user => user.name.toLowerCase() === name.toLowerCase() && user.x !== null);
            const user = users.find(user => user.name.toLowerCase() === name.toLowerCase() && user.password === password);

            if (user) {
                // If user found, show personalized content
                fetch('secret_santas.json')
                    .then(response => response.json())  // Parse the JSON data
                    .then(santas => {
                        const santa = santas.find(santa => santa.santa.toLowerCase() === name.toLowerCase());

                        document.getElementById('welcome').style.display = 'block';
                        document.getElementById('userName').textContent = user.name;
                        document.getElementById('toName').textContent = base64ToUtf8(santa.name);
                        document.getElementById('error').style.display = 'none';
                        document.getElementById('randomError').style.display = 'none';

                        // Optionally, store user login status in local storage to remember the login
                        localStorage.setItem('loggedInUser', JSON.stringify(user));
                        localStorage.setItem('loggedSanta', JSON.stringify(santa));
                        document.getElementById('loginForm').style.display = 'none';
                    })
                    .catch(error => console.error('Error fetching santa data:', error));
            } else {
                if (randomUser) {
                    document.getElementById('randomWelcome').style.display = 'block';
                    document.getElementById('randomUserName').textContent = randomUser.name;
                    document.getElementById('x').textContent = randomUser.x;
                    document.getElementById('error').style.display = 'none';
                    document.getElementById('randomError').style.display = 'none';
                    document.getElementById('loginForm').style.display = 'none';
                    localStorage.setItem('loggedInUser', JSON.stringify(user));
                } else {
                    if (!isNotRandomUser) {
                        document.getElementById('randomError').style.display = 'block';
                        document.getElementById('error').style.display = 'none';
                        document.getElementById('welcome').style.display = 'none';
                    }
                    else {
                        // If credentials are invalid, show error message
                        document.getElementById('error').style.display = 'block';
                        document.getElementById('randomError').style.display = 'none';
                        document.getElementById('welcome').style.display = 'none';
                    }
                }
            }
        })
        .catch(error => console.error('Error fetching user data:', error));
});

function base64ToUtf8(base64Str) {
    return decodeURIComponent(escape(atob(base64Str)));  // Decode from Base64
}

// Check if user is already logged in (using localStorage)
window.onload = function() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    const loggedSanta = localStorage.getItem('loggedSanta');
    if (loggedInUser) {
        const user = JSON.parse(loggedInUser);
        document.getElementById('welcome').style.display = 'block';
        document.getElementById('userName').textContent = user.name;
        document.getElementById('error').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
    }
    if (loggedSanta) {
        const santa = JSON.parse(loggedSanta);
        document.getElementById('toName').textContent = base64ToUtf8(santa.name);
    }
};

// Handle Logout
document.getElementById('logoutButton')?.addEventListener('click', function() {
    logout()
});

document.getElementById('logoutButton2')?.addEventListener('click', function() {
    logout()
});

function logout() {
    // Remove user data from localStorage
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('loggedSanta');
    // Hide welcome message and show login form
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('randomWelcome').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    document.getElementById('randomError').style.display = 'none';
    document.getElementById('password').textContent = null;

}