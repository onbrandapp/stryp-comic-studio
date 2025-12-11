import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { ViewState } from '../types';

interface GuidedTourProps {
    startOnMount?: boolean;
}

export const runTour = (currentView: ViewState) => {
    const driverObj = driver({
        showProgress: true,
        steps: []
    });

    if (currentView === ViewState.DASHBOARD) {
        driverObj.setSteps([
            {
                popover: {
                    title: 'Welcome to Stryp Comic Studio!',
                    description: 'This is your dashboard where you can manage all your comic projects.'
                }
            },
            {
                element: 'button:has(.lucide-plus)', // Target "New Project" button
                popover: {
                    title: 'Start Creating',
                    description: 'Click "New Project" to start your first comic strip or motion video.'
                }
            }
        ]);
    } else if (currentView === ViewState.STUDIO) {
        driverObj.setSteps([
            {
                popover: {
                    title: 'Studio Tour',
                    description: 'Welcome to the editor! Let\'s walk through the creation process.'
                }
            },
            {
                element: 'textarea[placeholder*="Describe the"]',
                popover: {
                    title: '1. Describe Your Scene',
                    description: 'Type a visual description of your panel here. Be specific about action, lighting, and mood.'
                }
            },
            {
                element: 'button:has(.lucide-users)',
                popover: {
                    title: '2. Select Characters',
                    description: 'Choose which characters appear in this panel. You can create consistent characters in the Vault.'
                }
            },
            {
                element: 'button:has(.lucide-wand-2)',
                popover: {
                    title: '3. Generate',
                    description: 'Click Generate to create the image (and audio/dialogue if enabled).'
                }
            },
            {
                element: '.overflow-y-auto',
                popover: {
                    title: '4. Timeline',
                    description: 'Your generated panels appear here. Drag to reorder, click to edit.'
                }
            }
        ]);
    } else {
        // Fallback or other views
        driverObj.setSteps([
            {
                popover: {
                    title: 'Stryp Comic Studio',
                    description: 'Explore the features using the sidebar menu.'
                }
            }
        ]);
    }

    driverObj.drive();
};

export const GuidedTour = ({ startOnMount = false }: GuidedTourProps) => {
    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenTour');

        // Only auto-start if we are in a context that makes sense (e.g., usually the Dashboard on first load)
        // We assume the app loads to Dashboard.
        if (startOnMount && !hasSeenTour) {
            runTour(ViewState.DASHBOARD);
            localStorage.setItem('hasSeenTour', 'true');
        }
    }, [startOnMount]);

    return null;
};

export default GuidedTour;
