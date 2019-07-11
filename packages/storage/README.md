# Tanker Storage

This package allows you to upload and download files to Tanker Storage.

## Construction

```javascript
import Storage from '@tanker/storage';

const storage = new Storage(tanker);
```

## Upload

```javascript
const resourceId = await storage.upload(file, {shareWithUsers, shareWithGroups});
```

## Download

```javascript
const file = await storage.download(resourceId);
```

That's all folks!
