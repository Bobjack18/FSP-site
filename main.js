// ... (rest of the code remains the same)

// NFC Implementation
function setupNfc() {
  const loginNfcButton = document.getElementById('login-with-nfc-button');
  const loginNfcStatus = document.getElementById('login-nfc-status');
  const enrollNfcButton = document.getElementById('enroll-nfc-button');
  const nfcStatus = document.getElementById('nfc-status');

  // Check if Web NFC API is available
  const isDesktop = window.innerWidth > 900;
  if (!('NDEFReader' in window)) {
    loginNfcStatus.textContent = 'Web NFC not supported in this browser';
    nfcStatus.textContent = 'Web NFC not supported in this browser';
    loginNfcButton.disabled = true;
    enrollNfcButton.disabled = true;
    // On desktop, hide the buttons or show a tooltip
    if (isDesktop) {
      loginNfcButton.style.display = 'none';
      enrollNfcButton.style.display = 'none';
    } else {
      loginNfcButton.title = 'NFC only available on supported mobile devices';
      enrollNfcButton.title = 'NFC only available on supported mobile devices';
    }
    return;
  }

  // Login with NFC functionality
  loginNfcButton.addEventListener('click', async () => {
    try {
      loginNfcStatus.textContent = 'Hold your NFC tag near the device...';
      const ndef = new NDEFReader();
      await ndef.scan();
      
      ndef.addEventListener('reading', ({ message, serialNumber }) => {
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding);
            const uid = textDecoder.decode(record.data);
            loginNfcStatus.textContent = `Read UID: ${uid}`;
            
            // Attempt to sign in with the UID
            signInWithCustomToken(auth, uid)
              .then((userCredential) => {
                loginNfcStatus.textContent = 'Login successful!';
                console.log('Signed in with NFC:', userCredential.user);
              })
              .catch((error) => {
                loginNfcStatus.textContent = `Login failed: ${error.message}`;
                console.error('NFC login error:', error);
              });
          }
        }
      });
    } catch (error) {
      loginNfcStatus.textContent = `Error: ${error}`;
      console.error('NFC scan error', error);
    }
  });

  // Enroll NFC tag functionality
  enrollNfcButton.addEventListener('click', async () => {
    try {
      nfcStatus.textContent = 'Hold a blank NFC tag near the device...';
      const ndef = new NDEFReader();
      // Add logic for enrolling NFC tag here if needed
    } catch (error) {
      nfcStatus.textContent = `Error: ${error}`;
      console.error('NFC enroll error', error);
    }
  });
}

// Call setupNfc when DOM is loaded
document.addEventListener('DOMContentLoaded', setupNfc);

// ... (rest of the code remains the same)
