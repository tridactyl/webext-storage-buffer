# Experimental storage buffer

Tridactyl has been having lots of problems with RC files apparently not executing in their entirety.

This package is an attempt to create an API to access the browser storage using a buffer which returns a promise which is fulfilled once the storage has actually been set (i.e. `browser.storage.x.get` would return the value you would expect).
