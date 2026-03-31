# INTERLUDE.
#### Video Demo:  https://youtu.be/ERuAYDDqBhQ

## Introduction
Interlude is a web application for playing music with a unique twist in UI. It is a modern reincarnation of a classic vinyl record player (or a turntable) in a digital form. While popular music applications like Spotify, Apple Music, YT Music, etc. are great themselves, I felt that in the pursuit of catering to masses and maximizing profits, creativity has diminished. So, I created a personal music app that stands out from the crowd and tries to keep the flame of creativity alive. The app has a clean, minimal, and modern aesthetics and extracts away the complexity of popular music apps, with a simple structure. The user logs in, connects their Spotify account to the app, searches for tracks, plays a track, and controls playback while managing a custom queue.

#### NOTE: This app requires an active Spotify device in background.

Under the hood, Interlude handles authentication, token management (access and refresh tokens), API communication, and persistant user data so that listening session feels continuous and reliable.

Interlude uses HTML, CSS, and JavaScript on the frontend, while Flask manages the backend architecture. User accounts are managed using SQLite database on the server-side. The database includes usernames, hashed passwords, and user's queue list. Apart from that, track data and media playback is powered by Spotify's Web API.

A major goal of this project was to make the UI feel distinct and alive. From turntable visuals, to animating the record, and getting the tone arm movement to feel natural and real, took a long time. At the same time, updating UI with changes to currently playing track and queue was quite challenging. The backend was made secure and maintainable, specially around OAuth and session handling using access and refresh tokens.

## Core Functionality
After visiting Interlude for the first time, the user can register himself with the app. Upon successful registration, or login if already registered, the user lands on the main interface of the application. The user can then play the already loaded single "Miles Away - NDL Overture by David Belanger". With connection to Spotify, Interlude can search for tracks, fetch user's top tracks, detect available playback devices, and control media playback.

If the user connects to Spotify, upon successful authentication, the user can search, play any track available, and add multiple tracks to their personal queue. The queue is saved to the user's database and fetched upon user login, therefore, queue state is not lost on a simple refresh. Interlude also checks and refreshes Spotify access tokens before they expire, reducing the need for re-authentication on user's end. The app is responsive to mobile-sized screens and therefore changes the interface from split-styled view to focused independent section view to preserve usability and visual clarity on smaller screens.

## File Breakdown
### Backend Files
`app.py`: This file is the backend entry point. It configures Flask, sessions, and the SQLite connection, then defines all core routes. It handles account registeration, login, logout, Spotify OAuth authorization, and callback handling. It also manages API endpoints for account tier, top tracks, search, playback, currently playing state, available devices, and queue persistance. It is effectively the control center for both authentication and music features.

`helpers.py`: Shared backend utilities live here. This file contains reusable decorators and auth logic, including login protection and Spotify auth protection. It also includes token lifecycle helpers that refresh access tokens using the refresh token before expiration. Keeping these functinalities in a seperate file keeps the routing clean and avoids duplicating sensitive auth code across endpoints.

### Frontend Files
`templates/layout.html`: This template provides the basic HTML structure to the entire application. It loads the shared CSS and JS assets, and renders the navigation and background visuals. Other pages extend this layout.

`templates/login.html`: This file extends `layout.html` and is the authentication page of the app. It includes both register and login forms.

`templates/index.html`: This file extends `layout.html` and is the main app UI. It includes turntable controls, search, records, queue, and user greetings.

`static/script.js`: This file is responsible of dynamic rendering and updation of the elements in the HTML document. It manages responsive panel switching, tab interactions, search behavior, queue updates, playback-related requests, and synchronization with backend API status.

`static/styles.css`: This file is responsible of base design and component appearance over all the HTML templates in the application.

`static/responsive.css`: This file is responsible for responsiveness of the application to different screen sizes (including mobile phones, tablets, etc.).

Static assests are organized in `audios`, `fonts`, and `images`, which support the app's custom look and sound context.

Dependency requirements are listed in `requirements.txt`.

## Design Choices and Tradeoffs
One major design decision was using server-side sessions with filesystem storage instead of a purely client-driven token model. This provided simple security for tokens and auth state, easy logout/invalidation from server, and less sensitive data exposed to the browser.
It was a safer and simpler choice for this project's architecture, however, the tradeoff is that it is less horizontally scalable than distributed session systems.

On the frontend, I chose a themed turntable interface instead of a minimal dashboard. Simpler UI would have been faster to build, but I wanted the project to express identity and creativity. This led to more time spent on layout, responsive behavior, and animation of the turntable.

Apart from that, the use of Spotify's API for getting music data and playback features was intentional. It has a great Web API documentation for developers. However, there are some major caveats of using Spotify API in "Development Mode". New users are needed to first contact the Admin (in this case "Me") to add them to Interlude's user database on Spotify API's User Mangement dashboard, and then they also require a Spotify Premium subscription to play any track.

## Final Reflection and Credits
Music has been an important part of my life. It motivates me to remain creative and believe in myself. What motivated me to learn computer science was the ability to build something with just a laptop. It allowed me to be creative and express myself through the apps that I build. Interlude is the project that I wanted to build. Being my first personal computer science project, it reflects me and my growth.

I thank Prof. David J. Malan and the entire CS50 team for making such beautiful courses accessible to everyone for free.

Credits:
1. CS50 Team: Foundation of Computer Science
https://cs50.harvard.edu/x/
2. Scrimba: JavaScript
https://scrimba.com/learn-javascript-c0v
3. Web Dev Simplified: Advanced Javascript
https://www.youtube.com/@WebDevSimplified