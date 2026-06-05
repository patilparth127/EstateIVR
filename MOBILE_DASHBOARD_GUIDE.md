# Mobile Dashboard Guide - Outbound Calling System

## Overview

The outbound calling dashboard is now fully mobile-responsive and optimized for use on mobile devices. This guide explains the mobile features and how to use them.

## Mobile Features

### 1. Responsive Design
- **Mobile-first layout** with touch-friendly buttons
- **Bottom navigation** for easy access to Contacts and Call Logs
- **Contact cards** instead of tables on mobile
- **Larger touch targets** (minimum 44px for buttons)
- **Optimized font sizes** for readability on small screens

### 2. Call Types

#### IVR Call (Automated)
- Plays automated IVR message: "Are you interested in our service?"
- Captures DTMF input: 1 = YES, 2 = NO
- Automatically updates contact status based on response
- Real-time notification when user presses YES

#### Hot Call (Manual)
- Manual call with agent intervention
- Call is automatically recorded
- After call ends, post-call feedback popup appears
- Agent can add remarks, labels, and reschedule information

### 3. Post-Call Feedback Popup

After a Hot Call ends, a popup appears with the following options:

**Status Options:**
- **Interested** - Contact showed interest
- **Not Interested** - Contact declined
- **Reschedule** - Call needs to be rescheduled

**Additional Fields:**
- **Remark** - Add call notes and observations
- **Reschedule Date** - Date/time picker for rescheduled calls (appears when "Reschedule" is selected)
- **Labels** - Select from predefined labels:
  - Hot Lead
  - Follow-up
  - Urgent
  - VIP
  - New
  - Returning

### 4. Mobile Navigation

**Bottom Navigation Bar:**
- **Contacts** - View and manage contact list
- **Logs** - View call history and logs

**Desktop Navigation:**
- Side-by-side panels for Contacts and Call Logs
- Full table view with all details

## Using the Dashboard on Mobile

### Step 1: Access the Dashboard
Open your mobile browser and navigate to:
```
http://your-server-ip:3000/outbound-dashboard.html
```

### Step 2: View Contacts
- Tap the "Contacts" tab in bottom navigation
- Scroll through contact cards
- Each card shows: Name, Phone, Status
- Action buttons: IVR (automated call), Hot (manual call)

### Step 3: Make an IVR Call
1. Tap "IVR" button on a contact card
2. Enter trunk name when prompted
3. Enter caller ID when prompted
4. Call initiates automatically
5. IVR message plays to contact
6. Contact presses 1 (YES) or 2 (NO)
7. Status updates automatically
8. Real-time notification appears if YES

### Step 4: Make a Hot Call
1. Tap "Hot" button on a contact card
2. Enter trunk name when prompted
3. Enter caller ID when prompted
4. Call connects to agent first
5. Agent speaks with contact
6. Call is automatically recorded
7. After call ends, feedback popup appears
8. Select status (Interested/Not Interested/Reschedule)
9. Add remark/notes
10. Select labels if needed
11. Tap "Save" to submit feedback

### Step 5: View Call Logs
- Tap the "Logs" tab in bottom navigation
- View all call history
- See call status and disposition
- Filter by date or status

## Mobile-Specific Features

### Touch Optimization
- Large buttons (minimum 44px height)
- Spaced touch targets
- Swipe-friendly lists
- Tap-to-call functionality

### Performance
- Lazy loading for large contact lists
- Optimized JavaScript for mobile browsers
- Reduced animations on mobile
- Efficient data fetching

### Offline Support
- Contact list cached locally
- Works with slow connections
- Graceful degradation

## Screen Sizes

### Small Mobile (< 375px)
- Single column layout
- Stacked statistics
- Compact contact cards
- Bottom navigation visible

### Medium Mobile (375px - 768px)
- Two-column statistics
- Full contact cards
- Bottom navigation visible

### Tablet/Desktop (> 768px)
- Side-by-side panels
- Full table view
- Bottom navigation hidden
- Hover effects enabled

## Configuration

### Trunk Name and Caller ID

For mobile use, you can pre-configure trunk name and caller ID to avoid prompts:

**Option 1: Set in Environment Variables**
```env
DEFAULT_TRUNK_NAME=gsm1
DEFAULT_CALLER_ID=919876543210
```

**Option 2: Hardcode in Dashboard**
Edit `outbound-dashboard.html` and modify the call functions:
```javascript
const trunkName = 'gsm1'; // Your trunk name
const callerId = '919876543210'; // Your caller ID
```

### Custom Labels

To add custom labels, edit the HTML in `outbound-dashboard.html`:
```html
<div class="label-tags" id="label-tags">
    <span class="label-tag" onclick="toggleLabel(this)">Hot Lead</span>
    <span class="label-tag" onclick="toggleLabel(this)">Follow-up</span>
    <span class="label-tag" onclick="toggleLabel(this)">Urgent</span>
    <span class="label-tag" onclick="toggleLabel(this)">VIP</span>
    <span class="label-tag" onclick="toggleLabel(this)">New</span>
    <span class="label-tag" onclick="toggleLabel(this)">Returning</span>
    <!-- Add your custom labels here -->
    <span class="label-tag" onclick="toggleLabel(this)">Custom Label</span>
</div>
```

## API Endpoints Used by Mobile Dashboard

### Contact Management
- `GET /api/outbound/contacts` - List contacts
- `POST /api/outbound/contacts` - Create contact
- `POST /api/outbound/contacts/:id/feedback` - Save post-call feedback

### Call Operations
- `POST /api/outbound/outbound-ivr/call` - Initiate call
- `GET /api/outbound/outbound-ivr/active` - Get active calls
- `GET /api/outbound/outbound-ivr/logs` - Get call logs

### Real-time Events (Socket.IO)
- `outbound-ivr-response` - IVR response notification
- `hot-call-ended` - Hot call ended event

## Troubleshooting

### Dashboard Not Loading on Mobile
1. Check server is running: `docker compose -f docker-compose.gsm.yml ps`
2. Verify mobile can access server IP
3. Check firewall allows port 3000
4. Clear browser cache and reload

### Buttons Not Responding
1. Check JavaScript console for errors
2. Verify API endpoint is accessible
3. Check network connection
4. Ensure API key is configured

### Post-Call Popup Not Appearing
1. Verify Socket.IO connection (check connection status badge)
2. Check if `hot-call-ended` event is being emitted
3. Review outbound-ivr.js for event emission
4. Check browser console for errors

### Labels Not Saving
1. Verify API endpoint `/api/outbound/contacts/:id/feedback` is working
2. Check Contact schema has `labels` field
3. Review API response in browser console
4. Check MongoDB for saved labels

## Best Practices for Mobile Use

### 1. Use Strong Network Connection
- Mobile data can be unreliable
- Use WiFi when possible
- Consider offline mode for contact list

### 2. Pre-Configure Settings
- Set default trunk name and caller ID
- Avoid repeated prompts
- Streamline call initiation

### 3. Use Headphones for Hot Calls
- Better audio quality
- Hands-free operation
- Easier to take notes

### 4. Regularly Sync Data
- Refresh contact list periodically
- Sync call logs after calls
- Check for updates

### 5. Battery Management
- Close dashboard when not in use
- Reduce auto-refresh frequency
- Use battery saver mode if needed

## Security Considerations

### Mobile Access
- Use HTTPS in production
- Implement authentication
- Set session timeouts
- Use secure API keys

### Data Protection
- Encrypt sensitive contact data
- Use secure connections
- Implement device-specific access
- Regular security updates

## Testing on Mobile

### Test Checklist
- [ ] Dashboard loads correctly
- [ ] Contact list displays properly
- [ ] IVR Call button works
- [ ] Hot Call button works
- [ ] Post-call popup appears after Hot Call
- [ ] Labels can be selected/deselected
- [ ] Feedback saves successfully
- [ ] Call logs display correctly
- [ ] Real-time notifications work
- [ ] Bottom navigation switches tabs
- [ ] Search and filter work
- [ ] Add contact works

### Recommended Mobile Browsers
- Chrome (Android)
- Safari (iOS)
- Firefox Mobile
- Samsung Internet

## Performance Tips

1. **Limit Contact List Size**
   - Pagination for large lists
   - Lazy loading
   - Search before scrolling

2. **Optimize Images**
   - Compress avatars
   - Use WebP format
   - Lazy load images

3. **Reduce Network Requests**
   - Batch API calls
   - Cache responses
   - Use localStorage

4. **Minimize JavaScript**
   - Code splitting
   - Tree shaking
   - Minify production build

## Future Enhancements

- Push notifications for missed calls
- Voice input for remarks
- Biometric authentication
- Offline mode with sync
- Progressive Web App (PWA) support
- Native mobile app (React Native)
- GPS-based routing
- Call recording playback on mobile
- Advanced analytics dashboard

## Support

For issues with mobile dashboard:
1. Check browser console for errors
2. Verify server logs
3. Test on different browsers
4. Check network connectivity
5. Review API responses

## Summary

The mobile dashboard provides a complete outbound calling solution optimized for mobile devices with:
- Two call types (IVR and Hot)
- Post-call feedback with labels
- Responsive design
- Touch-friendly interface
- Real-time notifications
- Full contact management
- Call history and logs

All features work seamlessly on mobile devices while maintaining full functionality.
