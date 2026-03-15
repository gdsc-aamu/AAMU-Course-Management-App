from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime
import os
import time as t
import pandas as pd


#Helper functions --------------------------------------------------------------------------------------------------------------
def log(semester, subject, course, message):
    parts = [p for p in [semester, subject, course] if p]
    prefix = " > ".join(parts)
    print(f"[{prefix}] {message}")

def parse_table(table):
    data = []
    isheader = True
    headers = [th.text for th in table.find_elements(By.TAG_NAME, 'th')]
    rows = table.find_elements(By.TAG_NAME, 'tr')
    for row in rows:
        cols = row.find_elements(By.TAG_NAME, 'td')
        if cols:
            data.append([col.text for col in cols])
            if len(cols) != len(headers) and isheader:
                isheader = False
    return isheader, headers, data

def get_semesters():
    dropdown = Select(wait.until(EC.presence_of_element_located((By.NAME, 'p_term'))))
    return [opt.text for opt in dropdown.options if opt.get_attribute('value')]

def get_subjects():
    dropdown = Select(wait.until(EC.presence_of_element_located((By.ID, 'subj_id'))))
    return [opt.text for opt in dropdown.options if opt.get_attribute('value')]

def get_courses():
    return wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, 'input[value="View Sections"]')))

def select_semester(semester):
    dropdown = Select(wait.until(EC.element_to_be_clickable((By.NAME, 'p_term'))))
    dropdown.select_by_visible_text(semester)
    t.sleep(1)
    driver.find_element(By.CSS_SELECTOR, 'input[value="Submit"]').click()
    t.sleep(2)

def select_subject(subject):
    dropdown = Select(wait.until(EC.element_to_be_clickable((By.ID, 'subj_id'))))
    dropdown.deselect_all()
    dropdown.select_by_visible_text(subject)
    t.sleep(1)
    driver.find_element(By.CSS_SELECTOR, 'input[name="SUB_BTN"][value="Course Search"]').click()
    t.sleep(2)

def click_view_sections(course_btn):
    course_btn.click()
    t.sleep(2)

def scrape_sections():
    table = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'table.datadisplaytable')))
    return parse_table(table)

def handle_no_results():
    driver.back()
    t.sleep(2)

def save_data(df, filename):
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DataCollection")
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    if os.path.exists(filepath):
        df.to_csv(filepath, mode='a', header=False, index=False)
    else:
        df.to_csv(filepath, index=False)

#Set Access point url(Always use the latest link)-------------------------------------------------------------------------------------------------------------
#The link always changes after a certain period of time, so it is better to ask the user to input the link instead of hardcoding it in the code. The user can copy the link from the browser and paste it in the terminal when prompted.
access_point = input("Enter the access point for the SDO website: ")
# Intilisation -------------------------------------------------------------------------------------------------------------

options = Options()
PROFILE_PATH = os.path.join(os.getcwd(), "DataCollection", "profile")
os.makedirs(PROFILE_PATH, exist_ok=True)
options.add_argument(f"user-data-dir={PROFILE_PATH}")
options.add_experimental_option('excludeSwitches', ['enable-logging'])
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 10)

#-------------------------------------------------------------------------------------------------------------
driver.get(access_point)


# Wait for confirmation of login 
login_confim = input("Have you logged in successfully? (yes/no): ")
while login_confim.lower() != "yes":
    print("Please log in to the SDO website and then type 'yes' to continue.")
    login_confim = input("Have you logged in successfully? (yes/no): ")
    #exit program if user types 'no'
    if login_confim.lower() == "no":
        print("Exiting the program. Please log in to the SDO website and then run the program again.")
        driver.quit()
        exit()
#-------------------------------------------------------------------------------------------------------------
# Navigate to term selection page
driver.find_element(By.XPATH, '/html/body/div[1]/div[2]/span/map/table/tbody/tr[1]/td/table/tbody/tr/td[3]/a').click()
t.sleep(5)
wait.until(EC.presence_of_element_located((By.XPATH, '/html/body/div[3]/table[1]/tbody/tr[1]/td[2]/a'))).click()
t.sleep(1)
wait.until(EC.presence_of_element_located((By.XPATH, '/html/body/div[3]/table[1]/tbody/tr[3]/td[2]/a'))).click()
t.sleep(1)

# Scrape all available semesters and ask user to select a range
all_semesters = get_semesters()
print(f"\nAvailable semesters:")
for i, sem in enumerate(all_semesters, 1):
    print(f"  {i}. {sem}")

while True:
    try:
        start = int(input(f"\nEnter start index (1-{len(all_semesters)}): "))
        end = int(input(f"Enter end index ({start}-{len(all_semesters)}): "))
        if start < 1 or end > len(all_semesters) or start > end:
            print(f"Invalid range. Start must be >= 1, end <= {len(all_semesters)}, and start <= end.")
            continue
    except ValueError:
        print("Please enter valid numbers.")
        continue

    selected_semesters = all_semesters[start - 1:end]
    print("\nYou selected the following semesters:")
    for i, sem in enumerate(selected_semesters, start):
        print(f"  {i}. {sem}")

    confirm = input("\nProceed with these semesters? (yes/no/quit): ")
    if confirm.lower() == "yes":
        break
    elif confirm.lower() == "quit":
        print("Exiting.")
        driver.quit()
        exit()
    else:
        print("Let's try again.")
#-------------------------------------------------------------------------------------------------------------
# Generate output filename from semester range and timestamp
semester_range = f"{selected_semesters[0].split(' (')[0].replace(' ', '')}_{selected_semesters[-1].split(' (')[0].replace(' ', '')}"
filename = f"{semester_range}_{datetime.now().strftime('%Y%m%d')}.csv"
all_data = []

# Main scraping loop
for semester in selected_semesters:
    status = "View Only" if "(View only)" in semester else "Active"
    select_semester(semester)

    subjects = get_subjects()
    for subject in subjects:
        log(semester, subject, None, "Scraping...")
        select_subject(subject)

        try:
            courses = get_courses()
        except:
            log(semester, subject, None, "No courses found, skipping.")
            handle_no_results()
            continue

        for i in range(len(courses)):
            # Re-fetch courses each iteration since DOM refreshes after navigating back
            courses = get_courses()
            course_btn = courses[i]
            course_name = course_btn.find_element(By.XPATH, './../../../td[2]').text
            log(semester, subject, course_name, "Fetching sections...")
            click_view_sections(course_btn)

            try:
                isheader, headers, data = scrape_sections()
                if data:
                    if isheader:
                        df = pd.DataFrame(data, columns=headers or None)
                    else:
                        df = pd.DataFrame(data)
                    df.insert(0, 'Subject', subject)
                    df.insert(0, 'Semester', semester)
                    df.insert(0, 'Status', status)
                    all_data.append(df)
                    log(semester, subject, course_name, f"{len(data)} section(s) found.")
                else:
                    log(semester, subject, course_name, "No sections found, skipping.")
            except:
                log(semester, subject, course_name, "Error scraping sections, skipping.")

            driver.back()
            t.sleep(2)

        driver.back()  # back to subject selection
        t.sleep(2)

    driver.back()  # back to semester selection
    t.sleep(2)

# Save all collected data to a single CSV
if all_data:
    final_df = pd.concat(all_data, ignore_index=True)
    save_data(final_df, filename)
    print(f"\nDone! Data saved to DataCollection/{filename}")
else:
    print("\nNo data collected.")

driver.quit()
