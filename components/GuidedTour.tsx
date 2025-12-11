import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface GuidedTourProps {
    startOnMount?: boolean;
}

export const runTour = () => {
    const tourDriver = driver({
        showProgress: true,
        steps: [
            {
                popover: {
                    title: 'Welcome to Stryp Comic Studio!',
                    description: 'This guided tour will walk you through the basics of creating your first AI-generated comic strip.'
                }
            },
            {
                element: 'textarea[placeholder*="Describe the"]',
                popover: {
                    title: '1. Describe Your Scene',
                    description: 'Start by typing a detailed description of what you want to see in your comic panel here. Be specific about lighting, mood, and action.'
                }
            },
            {
                element: '.grid-cols-2 > button:first-child', // Assuming "Characters" is the first tab/button or distinct area
                popover: {
                    title: '2. Choose Characters',
                    description: 'Click here to create or select persistent characters. This ensures your characters look consistent across all panels.'
                }
            },
            {
                element: 'button:has(.lucide-wand-2)', // Using Lucide icon class for "Generate"
                popover: {
                    title: '3. Generate Magic',
                    description: 'Once you are happy with your setup, click Generate. The AI will create your image, dialogue options, and even audio.'
                }
            },
            {
                element: '.overflow-y-auto', // The timeline area
                popover: {
                    title: '4. Your Comic Timeline',
                    description: 'Generated panels appear here. You can drag to reorder them, edit the text, or regenerate them if needed.'
                }
            },
            {
                popover: {
                    title: 'You are ready!',
                    description: 'That covers the basics. Have fun creating your story!'
                }
            }
        ]
    });

    tourDriver.drive();
};

export const GuidedTour = ({ startOnMount = false }: GuidedTourProps) => {
    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenTour');

        if (startOnMount && !hasSeenTour) {
            runTour();
            localStorage.setItem('hasSeenTour', 'true');
        }
    }, [startOnMount]);

    return null; // This component handles side effects only
};
